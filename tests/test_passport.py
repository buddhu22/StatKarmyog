"""
Pytest tests for Phase 5B: Competency Passport & Re-Assessment Trigger.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.db import Base, get_db
from app.main import app
from app.models.models import CompetencyScore
from app.seed import seed_database
from app.services.passport_engine import summarize_competency_history


from sqlalchemy.pool import StaticPool

# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def test_db_session():
    """In-memory SQLite DB populated with seed data."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    seed_database(session=session)
    yield session
    session.close()



@pytest.fixture(scope="module")
def client(test_db_session):
    """FastAPI TestClient with DB dependency override."""
    def _override_get_db():
        try:
            yield test_db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Task 3 Tests: summarize_competency_history ──────────────────────────────

class TestSummarizeCompetencyHistory:

    def test_two_scores_improved(self):
        """a. Two scores, second higher -> improved=True, correct delta."""
        scores = [
            {"recorded_on": "2026-01-01", "combined_score": 1.5, "confidence_level": "low", "source": "quiz"},
            {"recorded_on": "2026-02-01", "combined_score": 3.2, "confidence_level": "medium", "source": "quiz+artifact"},
        ]
        res = summarize_competency_history(scores)
        assert res["first_score"] == 1.5
        assert res["latest_score"] == 3.2
        assert res["improved"] is True
        assert res["delta"] == 1.7

    def test_two_scores_declined(self):
        """b. Two scores, second lower -> improved=False."""
        scores = [
            {"recorded_on": "2026-01-01", "combined_score": 3.5, "confidence_level": "medium", "source": "quiz"},
            {"recorded_on": "2026-02-01", "combined_score": 2.1, "confidence_level": "low", "source": "quiz"},
        ]
        res = summarize_competency_history(scores)
        assert res["first_score"] == 3.5
        assert res["latest_score"] == 2.1
        assert res["improved"] is False
        assert res["delta"] == -1.4

    def test_one_score_only(self):
        """c. One score only -> improved=None."""
        scores = [
            {"recorded_on": "2026-01-01", "combined_score": 2.5, "confidence_level": "low", "source": "baseline_quiz"}
        ]
        res = summarize_competency_history(scores)
        assert res["first_score"] == 2.5
        assert res["latest_score"] == 2.5
        assert res["improved"] is None
        assert res["delta"] == 0.0

    def test_empty_list(self):
        """d. Empty list -> handle gracefully, don't crash."""
        res = summarize_competency_history([])
        assert res["first_score"] is None
        assert res["latest_score"] is None
        assert res["improved"] is None
        assert res["delta"] == 0.0


# ── Task 1 Tests: GET /api/passport/{officer_id} ───────────────────────────

class TestPassportEndpoint:

    def test_get_passport_returns_history_and_improvement(self, client, test_db_session):
        """Seed two CompetencyScore rows for one officer/competency with different recorded_on, assert correct grouping and improved=true."""
        # Seed an extra row for OFF002 + CID-D-101 (Survey Design)
        score1 = CompetencyScore(
            officer_id="OFF002",
            cid="CID-D-101",
            skill_label="Survey Design",
            quiz_score=2.0,
            artifact_score=None,
            combined_score=2.0,
            confidence_level="low (1 source)",
            source="quiz_1",
            recorded_on="2026-01-10",
        )
        score2 = CompetencyScore(
            officer_id="OFF002",
            cid="CID-D-101",
            skill_label="Survey Design",
            quiz_score=3.5,
            artifact_score=None,
            combined_score=3.5,
            confidence_level="medium (2 sources)",
            source="quiz_2",
            recorded_on="2026-02-15",
        )
        test_db_session.add_all([score1, score2])
        test_db_session.commit()

        response = client.get("/api/passport/OFF002")
        assert response.status_code == 200
        data = response.json()
        assert data["officer_id"] == "OFF002"
        assert len(data["competencies"]) >= 1

        survey_comp = next((c for c in data["competencies"] if c["cid"] == "CID-D-101"), None)
        assert survey_comp is not None
        assert survey_comp["first_score"] == 2.0
        assert survey_comp["latest_score"] == 3.5
        assert survey_comp["improved"] is True
        assert survey_comp["delta"] == 1.5
        assert len(survey_comp["history"]) == 2

    def test_get_passport_unknown_officer_404(self, client):
        response = client.get("/api/passport/OFF999")
        assert response.status_code == 404

    def test_get_passport_no_scores(self, client, test_db_session):
        """Officer with no CompetencyScore rows returns empty competencies array and message."""
        from app.models.models import Officer
        officer = test_db_session.query(Officer).filter(Officer.officer_id == "OFF-NO-SCORES").first()
        if not officer:
            officer = Officer(
            officer_id="OFF-NO-SCORES",
                name="No Score Officer",
                designation="Statistical Assistant",
                role_id="R01",
                department="DIID",
                experience_years=2,
                qualification="B.Sc Statistics",
                past_trainings=[],
                current_skills={},
            )
            test_db_session.add(officer)
            test_db_session.commit()

        response = client.get("/api/passport/OFF-NO-SCORES")
        assert response.status_code == 200
        data = response.json()
        assert data["officer_id"] == "OFF-NO-SCORES"
        assert data["competencies"] == []
        assert "No assessment history yet" in data["message"]




# ── Task 2 Tests: POST /api/passport/{officer_id}/reassess ─────────────────

class TestReassessEndpoint:

    def test_reassess_valid_cid(self, client):
        """Valid cid returns 200 with recommended_action."""
        # OFF001 requires Survey Design (CID-D-101)
        response = client.post("/api/passport/OFF001/reassess", json={"cid": "CID-D-101"})
        assert response.status_code == 200
        data = response.json()
        assert data["cid"] == "CID-D-101"
        assert data["recommended_action"] == "retake_quiz"
        assert "Re-assessment ready" in data["message"]

    def test_reassess_invalid_cid(self, client):
        """Invalid cid for officer returns 404."""
        # CID-D-104 (Price Statistics) is not required for OFF001 (JSO - Industrial Statistics)
        response = client.post("/api/passport/OFF001/reassess", json={"cid": "CID-D-104"})
        assert response.status_code == 404
        data = response.json()
        assert "not a required competency" in data["detail"]
