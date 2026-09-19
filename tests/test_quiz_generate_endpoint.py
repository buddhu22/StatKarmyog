"""
End-to-end tests for POST /api/quiz/generate endpoint (Phase 4B updated).

Uses SQLite in-memory DB and mocks LLM calls so no real API key or network access is needed in CI.
"""

import io
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db, Base
from app.models.models import (
    Officer,
    Role,
    CourseCatalogue,
    Enrollment,
    CompetencyDictionary,
    CompetencyScore,
    QuizAttempt,
    QuizAttemptGenerated,
    QuizAttemptQuestion,
    AdminOutcomeSummary,
)
from app.routers.quiz import router as quiz_router


# ── SQLite In-Memory Database ────────────────────────────────────────────────
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


_test_app = FastAPI()
_test_app.include_router(quiz_router, prefix="/api")
_test_app.dependency_overrides[get_db] = override_get_db


from app.seed import (
    _seed_roles,
    _seed_officers,
    _seed_competency_dictionary,
)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    _seed_roles(db)
    _seed_officers(db)
    _seed_competency_dictionary(db)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(_test_app)


FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _good_question(i: int = 0) -> dict:
    return {
        "question": f"Test question {i}?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct": 0,
        "explanation": f"Explanation for question {i}.",
        "competency_tag": "COMP001",
    }


def _mock_generate_mcqs(text, difficulty, language, num_questions=10, **kwargs):
    """Return a list of well-formed mock questions with competency tags."""
    return [_good_question(i) for i in range(num_questions)]


# ── Tests ────────────────────────────────────────────────────────────────────

def test_generate_quiz_success(client):
    """Happy path: valid .txt file, mocked LLM returns valid questions."""
    fixture_content = (FIXTURES_DIR / "sample_doc.txt").read_bytes()
    rag_context = {"context": "Sampling document context.", "chunk_count": 1, "retrieved_chunk_count": 1}

    with patch("app.routers.quiz.generate_mcqs", side_effect=_mock_generate_mcqs):
        with patch("app.routers.quiz.get_cached", return_value=None):
            with patch("app.routers.quiz.set_cached"):
                with patch("app.services.document_rag.retrieve_relevant_context", return_value=rag_context):
                    resp = client.post(
                        "/api/quiz/generate",
                        files={"file": ("sample_doc.txt", fixture_content, "text/plain")},
                        data={
                            "officer_id": "OFF001",
                            "difficulty": "medium",
                            "language": "en",
                            "num_questions": "5",
                        },
                    )

    assert resp.status_code == 200
    body = resp.json()
    assert "attempt_id" in body
    assert "questions" in body
    assert len(body["questions"]) == 5

    for q in body["questions"]:
        assert "question" in q
        assert "options" in q
        assert len(q["options"]) == 4
        assert "competency_tag" in q
        assert "correct" in q
        assert isinstance(q["correct"], int)
        assert 0 <= q["correct"] <= 3
        assert "explanation" in q


def test_generate_quiz_invalid_difficulty(client):
    """Invalid difficulty should return 422."""
    fixture_content = (FIXTURES_DIR / "sample_doc.txt").read_bytes()

    resp = client.post(
        "/api/quiz/generate",
        files={"file": ("sample_doc.txt", fixture_content, "text/plain")},
        data={"officer_id": "OFF001", "difficulty": "impossible", "language": "en"},
    )
    assert resp.status_code == 422


def test_generate_quiz_invalid_language(client):
    """Invalid language should return 422."""
    fixture_content = (FIXTURES_DIR / "sample_doc.txt").read_bytes()

    resp = client.post(
        "/api/quiz/generate",
        files={"file": ("sample_doc.txt", fixture_content, "text/plain")},
        data={"officer_id": "OFF001", "difficulty": "easy", "language": "fr"},
    )
    assert resp.status_code == 422


def test_generate_quiz_unsupported_file_type(client):
    """Unsupported file extension should return 422."""
    resp = client.post(
        "/api/quiz/generate",
        files={"file": ("data.xlsx", b"fake excel content", "application/octet-stream")},
        data={"officer_id": "OFF001", "difficulty": "easy", "language": "en"},
    )
    assert resp.status_code == 422


def test_generate_quiz_file_too_large(client):
    """Files exceeding 5 MB should return 413."""
    big_content = b"A" * (6 * 1024 * 1024)  # 6 MB

    resp = client.post(
        "/api/quiz/generate",
        files={"file": ("big.txt", big_content, "text/plain")},
        data={"officer_id": "OFF001", "difficulty": "easy", "language": "en"},
    )
    assert resp.status_code == 413


def test_generate_quiz_empty_document(client):
    """Empty text file should return 422 (too short)."""
    resp = client.post(
        "/api/quiz/generate",
        files={"file": ("empty.txt", b"", "text/plain")},
        data={"officer_id": "OFF001", "difficulty": "easy", "language": "en"},
    )
    assert resp.status_code == 422


def test_generate_quiz_md_file(client):
    """Should accept .md files."""
    content = ("# Heading\n\nThis is a markdown test document with sufficient content. " * 20).encode()
    rag_context = {"context": "Markdown document context.", "chunk_count": 1, "retrieved_chunk_count": 1}

    with patch("app.routers.quiz.generate_mcqs", side_effect=_mock_generate_mcqs):
        with patch("app.routers.quiz.get_cached", return_value=None):
            with patch("app.routers.quiz.set_cached"):
                with patch("app.services.document_rag.retrieve_relevant_context", return_value=rag_context):
                    resp = client.post(
                        "/api/quiz/generate",
                        files={"file": ("notes.md", content, "text/markdown")},
                        data={"officer_id": "OFF001", "difficulty": "hard", "language": "en", "num_questions": "3"},
                    )

    assert resp.status_code == 200
    assert len(resp.json()["questions"]) == 3


def test_generate_quiz_cached_response(client):
    """Should return cached questions without calling the LLM."""
    fixture_content = (FIXTURES_DIR / "sample_doc.txt").read_bytes()
    cached_questions = [_good_question(i) for i in range(5)]
    rag_context = {"context": "Cached document context.", "chunk_count": 1, "retrieved_chunk_count": 1}

    with patch("app.routers.quiz.get_cached", return_value=cached_questions):
        with patch("app.services.document_rag.retrieve_relevant_context", return_value=rag_context):
            resp = client.post(
                "/api/quiz/generate",
                files={"file": ("sample_doc.txt", fixture_content, "text/plain")},
                data={"officer_id": "OFF001", "difficulty": "medium", "language": "en", "num_questions": "5"},
            )

    assert resp.status_code == 200
    assert len(resp.json()["questions"]) == 5


def test_generate_quiz_without_file_still_works(client):
    """Normal competency-based quiz generation must keep working without PDF upload."""
    with patch("app.routers.quiz.generate_mcqs", side_effect=_mock_generate_mcqs):
        with patch("app.routers.quiz.get_cached", return_value=None):
            with patch("app.routers.quiz.set_cached"):
                resp = client.post(
                    "/api/quiz/generate",
                    data={
                        "officer_id": "OFF001",
                        "difficulty": "medium",
                        "language": "en",
                        "num_questions": "4",
                        "target_competency": "Sampling",
                    },
                )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["questions"]) == 4
    db = TestingSessionLocal()
    try:
        attempt = db.query(QuizAttempt).filter_by(attempt_id=body["attempt_id"]).first()
        assert attempt is not None
        assert attempt.officer_id == "OFF001"
        assert attempt.target_competency == "Sampling"
    finally:
        db.close()


def test_generate_quiz_pdf_uses_document_rag_and_persists(client):
    """Valid PDF upload should flow through document RAG before LLM generation."""
    pdf_content = (FIXTURES_DIR / "test_sampling_manual.pdf").read_bytes()
    rag_context = {
        "context": "Sampling guideline context from uploaded PDF. Stratification and sample allocation are covered.",
        "chunk_count": 3,
        "retrieved_chunk_count": 2,
        "collection_name": "quiz_pdf_test",
    }

    with patch("app.routers.quiz.generate_mcqs", side_effect=_mock_generate_mcqs) as gen:
        with patch("app.routers.quiz.get_cached", return_value=None):
            with patch("app.routers.quiz.set_cached"):
                with patch("app.services.document_rag.retrieve_relevant_context", return_value=rag_context) as rag:
                    resp = client.post(
                        "/api/quiz/generate",
                        files={"file": ("test_sampling_manual.pdf", pdf_content, "application/pdf")},
                        data={
                            "officer_id": "OFF001",
                            "difficulty": "medium",
                            "language": "en",
                            "num_questions": "3",
                            "target_competency": "Sampling",
                        },
                    )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["questions"]) == 3
    rag.assert_called_once()
    assert gen.call_args.kwargs["target_competency"] == "Sampling"
    assert "uploaded PDF" in gen.call_args.kwargs.get("text", "") or "uploaded PDF" in gen.call_args.args[0]

    db = TestingSessionLocal()
    try:
        attempt = db.query(QuizAttempt).filter_by(attempt_id=body["attempt_id"]).first()
        assert attempt is not None
        assert attempt.officer_id == "OFF001"
        assert attempt.quiz_source_material == "test_sampling_manual.pdf"
        assert db.query(QuizAttemptGenerated).filter_by(attempt_id=body["attempt_id"]).count() == 3
    finally:
        db.close()


def test_generate_quiz_short_text_pdf_reaches_rag(client):
    """A valid text PDF below the generic text threshold should still use PDF RAG."""
    pdf_content = (FIXTURES_DIR / "sample_sampling_guidelines.pdf").read_bytes()
    rag_context = {
        "context": "Short readable PDF context about Stratified Sampling.",
        "chunk_count": 1,
        "retrieved_chunk_count": 1,
        "collection_name": "quiz_pdf_short_test",
    }

    with patch("app.routers.quiz.generate_mcqs", side_effect=_mock_generate_mcqs):
        with patch("app.routers.quiz.get_cached", return_value=None):
            with patch("app.routers.quiz.set_cached"):
                with patch("app.services.document_rag.retrieve_relevant_context", return_value=rag_context) as rag:
                    resp = client.post(
                        "/api/quiz/generate",
                        files={"file": ("sample_sampling_guidelines.pdf", pdf_content, "application/pdf")},
                        data={
                            "officer_id": "OFF001",
                            "difficulty": "medium",
                            "language": "en",
                            "num_questions": "3",
                            "target_competency": "Sampling",
                        },
                    )

    assert resp.status_code == 200
    rag.assert_called_once()


def test_generate_quiz_pdf_returns_specific_rag_error(client):
    """RAG failures should be returned as useful 422 errors, not fake quizzes."""
    pdf_content = (FIXTURES_DIR / "test_sampling_manual.pdf").read_bytes()

    with patch(
        "app.services.document_rag.retrieve_relevant_context",
        side_effect=ValueError("No relevant context retrieved from uploaded document."),
    ):
        resp = client.post(
            "/api/quiz/generate",
            files={"file": ("test_sampling_manual.pdf", pdf_content, "application/pdf")},
            data={
                "officer_id": "OFF001",
                "difficulty": "medium",
                "language": "en",
                "num_questions": "3",
                "target_competency": "Sampling",
            },
        )

    assert resp.status_code == 422
    assert "No relevant context retrieved" in resp.json()["detail"]


def test_generate_quiz_requires_llm_configuration(client):
    """A PDF must not be presented as an AI quiz when Gemini is unconfigured."""
    pdf_content = (FIXTURES_DIR / "test_sampling_manual.pdf").read_bytes()
    rag_context = {
        "context": "Extracted PDF context ready for the LLM.",
        "chunk_count": 1,
        "retrieved_chunk_count": 1,
    }

    with patch.dict("os.environ", {}, clear=True):
        with patch("app.services.document_rag.retrieve_relevant_context", return_value=rag_context):
            resp = client.post(
                "/api/quiz/generate",
                files={"file": ("test_sampling_manual.pdf", pdf_content, "application/pdf")},
                data={
                    "officer_id": "OFF001",
                    "difficulty": "medium",
                    "language": "en",
                    "num_questions": "3",
                    "target_competency": "Sampling",
                },
            )

    assert resp.status_code == 503
    assert resp.json()["code"] == "LLM_NOT_CONFIGURED"
    assert "GOOGLE_API_KEY" in resp.json()["error"]

