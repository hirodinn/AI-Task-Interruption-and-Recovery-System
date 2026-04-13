# Backend

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000` and docs at `http://localhost:8000/docs`.

