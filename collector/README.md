# Collector

Lightweight local process that watches file activity and basic git state changes,
and posts events to the backend.

## Setup

```bash
pip3 install --break-system-packages -r requirements.txt
cp .env.example .env
```

Note: `PROJECT_ROOT` and `PROJECT_NAME` are no longer managed through the `.env` file or terminal exports. The Collector now automatically synchronizes configured projects created directly using the Frontend Interface using the running Backend.

## Run

```bash
python3 collector.py
```

