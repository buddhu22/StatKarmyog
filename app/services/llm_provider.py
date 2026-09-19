"""
LLM provider abstraction for MCQ generation.

Wraps the LLM call behind a single function so the underlying model
(currently Google Gemini via REST API) can be swapped for Azure OpenAI,
a self-hosted model, or any other provider without touching the router
or any other code.

Environment variable required:
    GOOGLE_API_KEY — your Google AI Studio / Gemini API key.
"""

import json
import logging
import os
import re
import time

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Prompt Template ──────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert item-writer for professional training assessments used by \
government statistical agencies. Your task is to generate high-quality \
multiple-choice questions (MCQs) for statistical officers.

{target_competency_instruction}

RULES:
1. Generate exactly {num_questions} questions.
2. Difficulty level: {difficulty_description}
3. Language: {language_instruction}
4. Each question MUST have exactly 4 options.
5. The "correct" field must be the 0-based index (0, 1, 2, or 3) of the \
correct option.
6. Provide a brief explanation for why the correct answer is right.
7. For each question, you MUST assign a "competency_tag" — the competency ID \
(CID) from the COMPETENCY DICTIONARY below that this question most closely \
tests. You MUST pick exactly one CID from the list; do NOT invent new CIDs.
8. Return ONLY a valid JSON array — no markdown fences, no preamble, no \
trailing text. The output must be parseable by json.loads() directly.

COMPETENCY DICTIONARY (pick competency_tag from these CIDs only):
{competency_list}

OUTPUT SCHEMA (strict):
[
  {{
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correct": 0,
    "explanation": "string",
    "competency_tag": "CID-X-NNN"
  }}
]

SOURCE / DOMAIN CONTEXT TEXT:
{text}
"""

_DIFFICULTY_DESCRIPTIONS = {
    "easy": "Easy — recall and definition level. Questions should test basic "
            "factual recall, terminology, and simple definitions from the text.",
    "medium": "Medium — application level. Questions should test the ability "
              "to apply concepts, interpret scenarios, or compare approaches "
              "described in the text.",
    "hard": "Hard — analysis and scenario level. Questions should require "
            "multi-step reasoning, evaluating trade-offs, or analysing "
            "realistic scenarios based on the text.",
}

_LANGUAGE_INSTRUCTIONS = {
    "en": "Write all questions, options, and explanations in English.",
    "hi": "Write ALL questions, options, AND explanations in Hindi (हिन्दी). "
          "Use Devanagari script throughout.",
}


# ── JSON parsing helpers ─────────────────────────────────────────────────────

def _strip_markdown_fences(raw: str) -> str:
    """Remove ```json ... ``` fences that LLMs sometimes add."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _parse_llm_response(raw: str) -> list[dict]:
    """
    Parse the raw LLM string into a Python list of dicts.

    Tries direct JSON parse first; if that fails, strips markdown fences
    and retries once.
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        cleaned = _strip_markdown_fences(raw)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"LLM returned unparseable output. First 500 chars: {raw[:500]}"
            ) from exc


def _validate_questions(
    questions: list[dict],
    valid_cids: set[str] | None = None,
    cid_map: dict[str, str] | None = None,
    default_cid: str | None = None,
) -> list[dict]:
    """
    Keep and normalize well-formed question dicts. A valid question has:
    - "question" (str)
    - "options" (list of exactly 4 strings)
    - "correct" (int 0-3, or coercible string)
    - "explanation" (str)
    - "competency_tag" (str, mapped to valid CID)
    """
    valid = []
    for i, q in enumerate(questions):
        try:
            if not isinstance(q, dict):
                continue

            question_text = q.get("question")
            if not (isinstance(question_text, str) and question_text.strip()):
                logger.warning("Dropping question at index %d: missing question text", i)
                continue

            options = q.get("options")
            if not (isinstance(options, list) and len(options) == 4):
                logger.warning("Dropping question at index %d: options is not a list of 4 items", i)
                continue
            options = [str(o).strip() for o in options]
            if not all(options):
                logger.warning("Dropping question at index %d: empty option string", i)
                continue

            raw_correct = q.get("correct")
            correct_idx = None
            if isinstance(raw_correct, int) and 0 <= raw_correct <= 3:
                correct_idx = raw_correct
            elif isinstance(raw_correct, str):
                raw_str = raw_correct.strip().upper()
                if raw_str in {"0", "1", "2", "3"}:
                    correct_idx = int(raw_str)
                elif raw_str in {"A", "B", "C", "D"}:
                    correct_idx = ord(raw_str) - ord("A")

            if correct_idx is None or not (0 <= correct_idx <= 3):
                logger.warning("Dropping question at index %d: invalid correct index %s", i, raw_correct)
                continue

            explanation = q.get("explanation", "")
            if not isinstance(explanation, str) or not explanation.strip():
                explanation = "Explanation provided by assessment system."

            tag = q.get("competency_tag")
            final_tag = None

            if isinstance(tag, str) and tag.strip():
                tag_str = tag.strip()
                if valid_cids and tag_str in valid_cids:
                    final_tag = tag_str
                elif cid_map and tag_str.lower() in cid_map:
                    final_tag = cid_map[tag_str.lower()]

            if not final_tag:
                if default_cid:
                    final_tag = default_cid
                elif valid_cids:
                    final_tag = next(iter(valid_cids))
                else:
                    final_tag = "CID-D-101"

            valid.append({
                "question": question_text.strip(),
                "options": options,
                "correct": correct_idx,
                "explanation": explanation.strip(),
                "competency_tag": final_tag,
            })
        except Exception as exc:
            logger.warning("Dropping malformed question at index %d: %s (error: %s)", i, q, exc)
    return valid


# ── Public API ───────────────────────────────────────────────────────────────

def generate_mcqs(
    text: str,
    difficulty: str,
    language: str,
    num_questions: int = 10,
    valid_competencies: list[dict] | None = None,
    target_competency: str | None = None,
) -> list[dict]:
    """
    Generate MCQs from *text* using Google Gemini.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError(
            "GOOGLE_API_KEY environment variable is not set. "
            "Please set it to your Google AI Studio API key."
        )

    # Primary model from env; fallback chain tried on 503/429/timeout
    primary_model = os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest").strip()
    _FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"]
    # Build ordered candidate list: primary first, then any fallbacks not already primary
    _candidate_models = [primary_model] + [m for m in _FALLBACK_MODELS if m != primary_model]

    difficulty_description = _DIFFICULTY_DESCRIPTIONS.get(difficulty, _DIFFICULTY_DESCRIPTIONS["medium"])
    language_instruction = _LANGUAGE_INSTRUCTIONS.get(language, _LANGUAGE_INSTRUCTIONS["en"])

    # Build competency list string & cid lookup maps for the prompt
    target_cid = None
    cid_map = {}
    valid_cids = set()

    if valid_competencies:
        competency_list = "\n".join(
            f"- {c['cid']}: {c['label']}" for c in valid_competencies
        )
        for c in valid_competencies:
            cid = c["cid"]
            lbl = c["label"]
            valid_cids.add(cid)
            cid_map[cid.lower()] = cid
            cid_map[lbl.lower()] = cid

        if target_competency:
            target_lower = target_competency.lower()
            if target_lower in cid_map:
                target_cid = cid_map[target_lower]
            else:
                for c in valid_competencies:
                    if target_lower in c['label'].lower():
                        target_cid = c['cid']
                        break
    else:
        competency_list = "(No competency dictionary provided)"

    if target_competency:
        cid_clause = f" ({target_cid})" if target_cid else ""
        target_competency_instruction = (
            f"PRIMARY TARGET COMPETENCY FOCUS:\n"
            f"All or most questions MUST specifically assess knowledge, concepts, principles, and applications "
            f"related to '{target_competency}'{cid_clause}. Ensure questions focus on this competency topic."
        )
    else:
        target_competency_instruction = ""

    prompt = _SYSTEM_PROMPT.format(
        text=text,
        num_questions=num_questions,
        difficulty_description=difficulty_description,
        language_instruction=language_instruction,
        competency_list=competency_list,
        target_competency_instruction=target_competency_instruction,
    )

    # ── Retry loop: try each candidate model up to 2 times ───────────────
    last_err_msg = ""
    response = None
    model_name = primary_model

    for attempt_model in _candidate_models:
        model_name = attempt_model
        endpoint_url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        )
        for retry in range(2):
            logger.info(
                "Calling Gemini (%s) attempt %d: target_competency=%s (cid=%s), "
                "difficulty=%s, language=%s, num_questions=%d, text_len=%d",
                model_name, retry + 1,
                target_competency, target_cid, difficulty, language, num_questions, len(text),
            )
            try:
                response = requests.post(
                    endpoint_url,
                    params={"key": api_key},
                    json={
                        "contents": [
                            {
                                "role": "user",
                                "parts": [{"text": prompt}],
                            }
                        ],
                        "generationConfig": {
                            "temperature": 0.3,
                            "responseMimeType": "application/json",
                        },
                    },
                    timeout=90,
                )
            except requests.exceptions.RequestException as exc:
                last_err_msg = (
                    f"Gemini model '{model_name}' request failed on attempt "
                    f"{retry + 1}: {exc}"
                )
                logger.warning(last_err_msg)
                time.sleep(2 ** retry)  # 1s, 2s
                continue

            if response.status_code == 200:
                break  # success — exit retry loop

            # Retryable: 503 overloaded, 429 quota
            if response.status_code in (503, 429):
                last_err_msg = (
                    f"Gemini model '{model_name}' returned {response.status_code} "
                    f"on attempt {retry + 1}: {response.text[:200]}"
                )
                logger.warning(last_err_msg)
                time.sleep(2 ** retry)  # 1s, 2s
                continue

            # Non-retryable error for this model — break inner, try next model
            last_err_msg = (
                f"Gemini model '{model_name}' returned status {response.status_code}: "
                f"{response.text[:300]}"
            )
            logger.error(last_err_msg)
            response = None
            break

        if response is not None and response.status_code == 200:
            break  # success — exit model loop
        response = None  # reset so next model is tried

    if response is None or response.status_code != 200:
        err_msg = last_err_msg or "All Gemini model candidates failed."
        logger.error(err_msg)
        raise ValueError(err_msg)

    payload = response.json()
    try:
        raw_content = payload["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"Gemini returned an unexpected response shape: {payload}") from exc

    questions = _parse_llm_response(raw_content)
    valid_questions = _validate_questions(
        questions,
        valid_cids=valid_cids,
        cid_map=cid_map,
        default_cid=target_cid or (next(iter(valid_cids)) if valid_cids else None),
    )

    if len(valid_questions) < 3:
        raise ValueError(
            f"LLM produced only {len(valid_questions)} valid questions "
            f"(minimum 3 required). Raw output had {len(questions)} items."
        )

    logger.info(
        "Generated %d valid questions (of %d raw).",
        len(valid_questions), len(questions),
    )

    return valid_questions
