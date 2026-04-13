from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import create_db_and_tables
from .routes import router


def create_app() -> FastAPI:
    app = FastAPI(title="AI Task Interruption Recovery System")

    # MVP-friendly CORS. Lock down in production.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def _startup() -> None:
        create_db_and_tables()

    app.include_router(router)
    return app


app = create_app()

