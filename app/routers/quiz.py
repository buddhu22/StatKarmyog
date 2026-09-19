"""
Quiz Generation & Submission router — Phase 4 + Phase 4B.

POST /api/quiz/generate
    Accept a document upload (multipart/form-data), extract its text, generate
    MCQs via the LLM provider, persist an answer-key shell, and return the
    questions plus an attempt_id.

POST /api/quiz/submit
    Accept answers for a previously generated quiz attempt, score them, persist
    results into QuizAttemptQuestion and CompetencyScore, and return
    detailed per-question results and per-competency score summaries.
"""

import datetime
import logging
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import (
    CompetencyDictionary,
    CompetencyScore,
    Officer,
    QuizAttempt,
    QuizAttemptGenerated,
    QuizAttemptQuestion,
)
from app.schemas.schemas import (
    QuestionResult,
    QuizSubmitRequest,
    QuizSubmitResponse,
    ScoreSummaryItem,
)
from app.services.document_extractor import extract_text, SUPPORTED_EXTENSIONS
from app.services.llm_provider import generate_mcqs
from app.services.quiz_cache import get_cached, set_cached
from app.services.work_artifacts import (
    get_artifact,
    validate_officer_artifact_assignment,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Maximum upload size in bytes (5 MB)
MAX_FILE_SIZE = 5 * 1024 * 1024

VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_LANGUAGES = {"en", "hi"}


# ── POST /api/quiz/generate ─────────────────────────────────────────────────

@router.post("/quiz/generate")
async def generate_quiz(
    file: UploadFile | None = File(default=None),
    difficulty: str = Form(default="medium"),
    language: str = Form(default="en"),
    num_questions: int = Form(default=10),
    officer_id: str = Form(...),
    target_competency: str | None = Form(default=None),
    course_id: str | None = Form(default=None),
    artifact_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    """
    Generate MCQs either from an uploaded document (RAG-Grounded) or directly
    for an officer's target competency (Competency-Based).
    """
    # ── Sanitize course_id ──────────────────────────────────────────────
    if not isinstance(course_id, str):
        course_id = None
    if not isinstance(artifact_id, str) or not artifact_id.strip():
        artifact_id = None

    # ── Validate officer_id ──────────────────────────────────────────────
    officer = db.query(Officer).filter(Officer.officer_id == officer_id).first()
    if not officer:
        raise HTTPException(
            status_code=404,
            detail=f"Officer '{officer_id}' not found.",
        )

    # ── Validate difficulty ──────────────────────────────────────────────
    if difficulty not in VALID_DIFFICULTIES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid difficulty '{difficulty}'. Must be one of: {', '.join(sorted(VALID_DIFFICULTIES))}",
        )

    # ── Validate language ────────────────────────────────────────────────
    if language not in VALID_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid language '{language}'. Must be one of: {', '.join(sorted(VALID_LANGUAGES))}",
        )

    # ── Validate num_questions ───────────────────────────────────────────
    if not (1 <= num_questions <= 20):
        raise HTTPException(
            status_code=422,
            detail=f"num_questions must be between 1 and 20 (got {num_questions}).",
        )

    artifact_context = None
    if artifact_id:
        artifact_context = get_artifact(db, artifact_id)
        if artifact_context is None:
            raise HTTPException(status_code=404, detail=f"Artifact '{artifact_id}' not found.")
        if not validate_officer_artifact_assignment(db, officer_id, artifact_id):
            raise HTTPException(
                status_code=403,
                detail=f"Artifact '{artifact_id}' is not assigned to officer '{officer_id}'.",
            )
        if not target_competency and artifact_context.get("competencies"):
            target_competency = artifact_context["competencies"][0]["competency_label"]

    filename = ""
    text = ""

    # Check if a file was actually provided
    has_file = file is not None and bool(file.filename and file.filename.strip())

    if has_file:
        filename = file.filename or ""
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported file type '{ext}'. Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
            )

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large ({len(content) / (1024*1024):.1f} MB). Maximum allowed size is 5 MB.",
            )
        await file.seek(0)

        # Mode 2: RAG Grounded Document Extraction + ChromaDB Context Retrieval
        try:
            from app.services.document_rag import retrieve_relevant_context

            logger.info("[PDF] filename=%s size=%d", filename, len(content))
            raw_text = await extract_text(file)
            logger.info("[EXTRACTION] filename=%s characters_extracted=%d", filename, len(raw_text))
            rag_result = retrieve_relevant_context(
                raw_text,
                source=filename,
                target_competency=target_competency,
            )
            text = rag_result["context"]
            logger.info(
                "[RAG] filename=%s chunks_created=%d retrieved_chunks=%d context_length=%d",
                filename,
                rag_result["chunk_count"],
                rag_result["retrieved_chunk_count"],
                len(text),
            )
        except ValueError as exc:
            logger.warning("[RAG] filename=%s status=failed error=%s", filename, exc)
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            logger.exception("Unexpected error during text extraction / RAG")
            return JSONResponse(
                status_code=500,
                content={"error": "Text extraction or document retrieval failed. Please try another readable PDF."},
            )
    else:
        # Mode 1: Competency-Based Assessment (No File Uploaded)
        # Use logged-in officer's actual competency gap if target_competency is missing
        if not target_competency or not target_competency.strip():
            from app.services.gap_analysis import compute_skill_gaps
            gap_res = compute_skill_gaps(db, officer_id)
            if gap_res and gap_res.get("gaps"):
                target_competency = gap_res["gaps"][0]["skill"]

        filename = f"Competency-Based Assessment ({target_competency or 'General Statistical Competency'})"
        comp_label = target_competency or "Statistical Operations"
        artifact_clause = ""
        if artifact_context:
            artifact_clause = (
                f"\nAssigned Work Artifact: {artifact_context['title']}.\n"
                f"Artifact Domain: {artifact_context['domain']}.\n"
                f"Artifact Description: {artifact_context['description']}.\n"
                f"Artifact Skills: {', '.join(artifact_context.get('skills') or [])}.\n"
            )
        text = (
            f"Official Assessment Context for Officer: {officer.name} ({officer.designation}, {officer.department}).\n"
            f"Role: {officer.role_id}.\n"
            f"Target Competency Domain: {comp_label}.\n"
            f"{artifact_clause}"
            f"Scope: Professional statistical concepts, methodologies, sampling frameworks, data collection, data quality, "
            f"and analytical standards in Indian Government Statistical Services (MoSPI / NSSTA)."
        )

    # ── Load CompetencyDictionary for LLM prompt ─────────────────────────
    competency_rows = db.query(CompetencyDictionary).all()
    valid_competencies = [
        {"cid": row.cid, "label": row.label} for row in competency_rows
    ]

    # ── Check cache ──────────────────────────────────────────────────────
    cache_key = f"{text}_{target_competency}"
    cached = get_cached(cache_key, difficulty, language, num_questions)
    if cached is not None:
        logger.info("Returning cached quiz (%d questions)", len(cached))
        questions = cached
    else:
        # ── Generate MCQs via LLM ────────────────────────────────────────
        try:
            logger.info("[LLM] request_started context_length=%d target_competency=%s", len(text), target_competency)
            questions = generate_mcqs(
                text=text,
                difficulty=difficulty,
                language=language,
                num_questions=num_questions,
                valid_competencies=valid_competencies,
                target_competency=target_competency,
            )
            logger.info("[QUIZ] questions_generated=%d schema_valid=true", len(questions))
        except ValueError as exc:
            logger.warning("MCQ generation failed: %s", exc)
            if "GOOGLE_API_KEY environment variable is not set" in str(exc):
                return JSONResponse(
                    status_code=503,
                    content={
                        "code": "LLM_NOT_CONFIGURED",
                        "error": (
                            "Quiz generation is not configured on the server. "
                            "Set GOOGLE_API_KEY in Render and redeploy."
                        )
                    },
                )
            return JSONResponse(
                status_code=502,
                content={"error": "The LLM service did not return a valid quiz. Please try again."},
            )
        except Exception as exc:
            logger.exception("Unexpected error during MCQ generation")
            return JSONResponse(
                status_code=500,
                content={"error": "Quiz generation failed. Please try another learning material or reduce the number of questions."},
            )

        # ── Cache the result ─────────────────────────────────────────────
        set_cached(cache_key, difficulty, language, num_questions, questions)

    # ── Persist QuizAttempt shell + QuizAttemptGenerated answer key ───────
    attempt_id = str(uuid.uuid4())

    quiz_attempt = QuizAttempt(
        attempt_id=attempt_id,
        officer_id=officer_id,
        course_id=course_id,
        artifact_id=artifact_id,
        target_competency=target_competency,
        quiz_source_material=filename,
        attempted_on=None,       # Not yet submitted
        raw_score_percent=None,  # Not yet scored
    )
    db.add(quiz_attempt)

    for idx, q in enumerate(questions):
        db.add(QuizAttemptGenerated(
            attempt_id=attempt_id,
            question_index=idx,
            question_text=q["question"],
            options=q["options"],
            correct_index=q["correct"],
            competency_tag=q["competency_tag"],
            explanation=q.get("explanation", ""),
        ))

    db.commit()
    logger.info("[DATABASE] quiz_saved=true attempt_id=%s officer_id=%s source=%s", attempt_id, officer_id, filename)

    return {"attempt_id": attempt_id, "questions": questions}


# ── POST /api/quiz/submit ───────────────────────────────────────────────────

@router.post("/quiz/submit", response_model=QuizSubmitResponse)
def submit_quiz(
    body: QuizSubmitRequest,
    db: Session = Depends(get_db),
):
    """
    Submit answers for a previously generated quiz attempt.

    Scores the answers, persists per-question results and per-competency
    CompetencyScore rows, and returns detailed feedback.
    """
    # ── 1. Look up the attempt ───────────────────────────────────────────
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.attempt_id == body.attempt_id
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz attempt not found.")

    # ── 2. Validate officer_id matches ───────────────────────────────────
    if attempt.officer_id != body.officer_id:
        raise HTTPException(
            status_code=400,
            detail="officer_id does not match the attempt's officer_id.",
        )

    # ── 3. Check for double-submission (Task 4) ──────────────────────────
    if attempt.attempted_on is not None:
        raise HTTPException(
            status_code=409,
            detail="This attempt has already been submitted.",
        )

    # ── 4. Fetch generated questions (answer key) ────────────────────────
    generated = (
        db.query(QuizAttemptGenerated)
        .filter(QuizAttemptGenerated.attempt_id == body.attempt_id)
        .order_by(QuizAttemptGenerated.question_index.asc())
        .all()
    )
    if not generated:
        raise HTTPException(status_code=404, detail="No generated questions found for this attempt.")

    # ── 5. Validate answer count (Task 4) ────────────────────────────────
    if len(body.answers) != len(generated):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Expected {len(generated)} answers but received {len(body.answers)}. "
                f"Submit exactly one answer index per question."
            ),
        )

    # ── 6. Score each question ───────────────────────────────────────────
    today = datetime.date.today().isoformat()

    # Build a cid -> label lookup from CompetencyDictionary
    comp_dict_rows = db.query(CompetencyDictionary).all()
    cid_to_label = {row.cid: row.label for row in comp_dict_rows}

    results: list[QuestionResult] = []
    # Track per-competency correct/total for scoring
    competency_stats: dict[str, dict] = defaultdict(lambda: {"correct": 0, "total": 0})

    for gq, answer_idx in zip(generated, body.answers):
        is_correct = (answer_idx == gq.correct_index)
        skill_label = cid_to_label.get(gq.competency_tag, gq.competency_tag)

        # Insert QuizAttemptQuestion row
        db.add(QuizAttemptQuestion(
            attempt_id=body.attempt_id,
            competency_tag=gq.competency_tag,
            skill_label=skill_label,
            is_correct=is_correct,
        ))

        competency_stats[gq.competency_tag]["total"] += 1
        if is_correct:
            competency_stats[gq.competency_tag]["correct"] += 1

        results.append(QuestionResult(
            question_index=gq.question_index,
            competency_tag=gq.competency_tag,
            skill_label=skill_label,
            is_correct=is_correct,
            correct_option_index=gq.correct_index,
            explanation=gq.explanation or "",
        ))

    # ── 7. Update the QuizAttempt row ────────────────────────────────────
    total_correct = sum(s["correct"] for s in competency_stats.values())
    total_questions = sum(s["total"] for s in competency_stats.values())
    overall_raw_percent = (total_correct / total_questions * 100) if total_questions > 0 else 0.0

    attempt.attempted_on = today
    attempt.raw_score_percent = round(overall_raw_percent, 1)

    # ── 8. Compute per-competency scores and write CompetencyScore rows ──
    score_summary: list[ScoreSummaryItem] = []

    for cid, stats in competency_stats.items():
        raw_score_percent = (stats["correct"] / stats["total"] * 100) if stats["total"] > 0 else 0.0
        quiz_score = round(1 + (raw_score_percent / 100) * 4, 1)

        skill_label = cid_to_label.get(cid, cid)

        # Look up latest existing CompetencyScore for this officer + cid
        latest_existing = (
            db.query(CompetencyScore)
            .filter(
                CompetencyScore.officer_id == body.officer_id,
                CompetencyScore.cid == cid,
            )
            .order_by(CompetencyScore.recorded_on.desc(), CompetencyScore.id.desc())
            .first()
        )

        artifact_score = latest_existing.artifact_score if latest_existing else None

        if artifact_score is not None:
            combined_score = round(0.6 * quiz_score + 0.4 * artifact_score, 1)
            confidence_level = "medium (2 sources)"
        else:
            combined_score = quiz_score
            confidence_level = "low (1 source)"

        # Insert a NEW CompetencyScore row (history table — no update in place)
        db.add(CompetencyScore(
            officer_id=body.officer_id,
            cid=cid,
            skill_label=skill_label,
            quiz_score=quiz_score,
            artifact_score=artifact_score,
            combined_score=combined_score,
            confidence_level=confidence_level,
            source=f"quiz_attempt_{body.attempt_id}",
            recorded_on=today,
        ))

        score_summary.append(ScoreSummaryItem(
            cid=cid,
            skill_label=skill_label,
            quiz_score=quiz_score,
            combined_score=combined_score,
            confidence_level=confidence_level,
        ))

    db.commit()

    return QuizSubmitResponse(
        attempt_id=body.attempt_id,
        results=results,
        score_summary=score_summary,
    )
