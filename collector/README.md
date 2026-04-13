# Collector

Lightweight local process that watches file activity and basic git state changes,
and posts events to the backend.

## Setup

```bash
pip3 install --break-system-packages -r requirements.txt
cp .env.example .env
```

Edit `.env` and set `PROJECT_ROOT` to the repo you want to track.

## Run

```bash
python3 collector.py
```

