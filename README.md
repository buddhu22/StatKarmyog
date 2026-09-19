# StatKarmyog

> AI-enabled competency intelligence and learning platform for MoSPI / NSSTA statistical officers.
> Developed for Smart India Hackathon Problem Statement PS 26101.

---

## 📌 Executive Summary

StatKarmyog provides evidence-based competency mapping, gap analysis, document-grounded quiz generation, work-artifact analysis, learning recommendations, competency passports, and outcome analytics for statistical officials.

It operates as an intelligence layer integrated with platforms like **iGOT Karmayogi**, transitioning competency tracking from static self-declarations to a dynamic, multi-source evidence system (quizzes + work artifacts).

---

## Technology Stack

- **Backend Core:** FastAPI, Uvicorn, Python 3.10+
- **Database & ORM:** SQLite (SQLAlchemy 2.0)
- **Vector Search & AI:** ChromaDB (embeddings), Sentence Transformers, Google Gemini API
- **Frontend UI:** React 19, Vite, Ant Design, Tailwind CSS, Recharts
- **Async & Integration:** Celery, Redis (Mock-iGOT webhook service)
- **Testing:** Pytest backend tests and Oxlint frontend checks

---

## Quick Start

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- (Optional) Redis server on `localhost:6379` for async background workers

### Environment Setup
Copy `.env.example` to `.env` in the project root and replace the Gemini placeholder:
```env
GOOGLE_API_KEY=your_gemini_api_key
CORS_ALLOWED_ORIGINS=http://localhost:5173
DATA_DIR=./data
ENABLE_SEMANTIC_SEARCH=true
```

The root `.env` is ignored by Git. Never commit API keys. For a Render free
instance, set `ENABLE_SEMANTIC_SEARCH=false`; uploaded PDF text still flows
directly to Gemini without loading the optional embedding index.

### Install Dependencies
```powershell
# From the repository root
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Install React frontend dependencies
cd frontend
npm install
```

### Run Locally

```powershell
# In another terminal
cd frontend
npm run dev
```

Start the backend with `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` in the first terminal. Open `http://localhost:5173` in a browser. The optional mock-iGOT service runs on port 8001 and is not required for the main officer workflow.

---

## System Architecture & Key Capabilities

```
┌─────────────────────────────────────────────────────────┐
│                 React Frontend (Vite)                   │
│   - Officer Dashboard (Radar Chart, Gaps, Recommendations)│
│   - Competency Passport (Score Trajectory & History)    │
│   - AI Quiz Generator & Submission                      │
│   - MoSPI Admin Outcome Analytics Dashboard             │
└────────────────────────────┬────────────────────────────┘
                             │ REST API / JSON
                             ▼
┌─────────────────────────────────────────────────────────┐
│               FastAPI Backend (Port 8000)               │
│   - Competency & Gap Engine (60% Quiz / 40% Artifact)   │
│   - Passport & History Tracking Endpoint                │
│   - LLM Provider Abstraction & MCQ Generator            │
│   - Hybrid Semantic Course Recommendations (ChromaDB)   │
└────────────────────────────┬────────────────────────────┘
                             │ Webhook Updates
                             ▼
┌─────────────────────────────────────────────────────────┐
│          Mock-iGOT Service & Webhook (Port 8001)        │
│   - Enrollment Lifecycle (Enrolled -> In-Progress -> Completed)│
│   - Event Pushes via Celery/Redis & Direct Trigger      │
└─────────────────────────────────────────────────────────┘
```

---

## Production Deployment

Deploy the backend to Render with:

```text
Build: pip install -r requirements-render.txt
Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health check: /api/health
```

Set these Render variables:

```text
GOOGLE_API_KEY=your_gemini_api_key
CORS_ALLOWED_ORIGINS=https://statkarmyog.vercel.app
DATA_DIR=/opt/render/project/src/data
ENABLE_SEMANTIC_SEARCH=false
```

Deploy `frontend/` to Vercel with:

```text
VITE_API_BASE_URL=https://statkarmyog-1.onrender.com
```

The Vercel rewrite in `frontend/vercel.json` supports direct navigation to
routes such as `/quiz` and `/dashboard`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Public landing page |
| `/login` | Demo officer/admin login |
| `/dashboard` | Officer competency overview |
| `/gaps` | Detailed competency gap analysis |
| `/quiz` | PDF/document and competency-based quiz generation |
| `/my-quizzes` | Quiz history |
| `/artifacts` | Work evidence and artifact analysis |
| `/passport` | Competency history and improvement trajectory |
| `/progress` | Progress and gap-reduction analytics |
| `/admin` | Protected aggregate analytics |

## Validation

```powershell
.\.venv\Scripts\python.exe -m pytest -q
Push-Location frontend; npm run lint; npm run build; Pop-Location
```

## Documentation Links & Runbook

- [DEPLOYMENT.md](DEPLOYMENT.md) — Render and Vercel configuration.
- [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) — Demo walkthrough and presentation script.
- [SETUP.md](SETUP.md) — Additional setup and API notes.

---

## Constraints
- **Database Engine:** Uses SQLite for local prototype convenience; production environments can switch to PostgreSQL via SQLAlchemy connection strings.
- **Async Workers:** Status auto-advancement relies on Celery + Redis; manual trigger endpoints work without Redis.
- **AI Quiz Generation:** A valid `GOOGLE_API_KEY` is required. The API reports an explicit configuration error when it is absent; it does not fabricate AI questions.
