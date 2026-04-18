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

## AI Provider

Default is disabled:

```bash
AI_PROVIDER=none
```

OpenAI option:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Mistral option:

```bash
AI_PROVIDER=mistral
MISTRAL_API_KEY=...
MISTRAL_MODEL=open-mistral-nemo
```

