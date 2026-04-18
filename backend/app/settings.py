from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Default allows out-of-the-box local dev. Override with Neon via DATABASE_URL.
    database_url: str = "sqlite:///./local.db"
    session_gap_minutes: int = 15

    ai_provider: str = "none"  # "none" | "openai" | "mistral"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    mistral_api_key: str | None = None
    mistral_model: str = "open-mistral-nemo"


settings = Settings()  # type: ignore[call-arg]

