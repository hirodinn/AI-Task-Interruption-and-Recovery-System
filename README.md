# AI Task Interruption Recovery System (MVP)

Captures local coding activity, groups it into sessions, and uses an external LLM to generate a “resume context” summary after interruptions.

## Components

- **Backend** (`backend/`): FastAPI + SQLModel storage, session grouping, summarization endpoint
- **Collector** (`collector/`): watches filesystem + basic git state changes, posts events to backend
- **Frontend** (`frontend/`): React dashboard to browse sessions and trigger summarization

## Quickstart (local)

### 1) Backend

```bash
cd backend
cp .env.example .env
# Optional: set DATABASE_URL for Neon Postgres in backend/.env

pip3 install --break-system-packages -r requirements.txt
PYTHONPATH=. python3 -m uvicorn app.main:app --port 8000
```

API docs at `http://127.0.0.1:8000/docs`.

### 2) Collector

```bash
cd collector
cp .env.example .env
# Edit .env and set PROJECT_ROOT to the project you want to track

pip3 install --break-system-packages -r requirements.txt
python3 collector.py
```

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## “Finished MVP” checklist

- Backend running and reachable (`GET /api/health`)
- Collector running and sending events to backend
- Frontend shows sessions and timeline
- You can edit a session **Objective** and click **Summarize session**
- You can click **Copy resume** to paste context into a new task/chat

## API (MVP)

- `POST /api/events`: ingest an activity event (collector uses this)
- `GET /api/sessions`: list recent sessions
- `GET /api/sessions/{id}`: session detail
- `GET /api/sessions/{id}/events`: session timeline
- `POST /api/sessions/{id}/summarize`: generate/update AI summary fields

## AI Provider

By default `AI_PROVIDER=none` (summaries return a stub).

To enable OpenAI:

```
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

