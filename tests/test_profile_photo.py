from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.routers.api import router as api_router
from app.seed import _seed_officers, _seed_roles


def _client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    _seed_roles(session)
    _seed_officers(session)
    session.commit()

    app = FastAPI()
    app.include_router(api_router, prefix="/api")

    def override_get_db():
      try:
          yield session
      finally:
          pass

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), session


def test_profile_photo_upload_updates_only_requested_officer():
    client, session = _client()
    try:
        resp = client.post(
            "/api/officers/OFF001/profile-photo",
            files={"file": ("photo.png", b"\x89PNG\r\n\x1a\nprofile", "image/png")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["officer_id"] == "OFF001"
        assert body["profile_photo_url"].startswith("/static/profile_photos/OFF001_")

        off001 = client.get("/api/officers/OFF001").json()
        off002 = client.get("/api/officers/OFF002").json()
        assert off001["profile_photo_url"] == body["profile_photo_url"]
        assert off002["profile_photo_url"] is None
    finally:
        session.close()


def test_profile_photo_rejects_unsupported_files():
    client, session = _client()
    try:
        resp = client.post(
            "/api/officers/OFF001/profile-photo",
            files={"file": ("notes.txt", b"not an image", "text/plain")},
        )
        assert resp.status_code == 422
    finally:
        session.close()
