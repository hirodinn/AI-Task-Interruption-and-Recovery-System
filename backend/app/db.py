from __future__ import annotations

from sqlmodel import Session, SQLModel, create_engine

from .settings import settings


engine = create_engine(settings.database_url, pool_pre_ping=True)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session

