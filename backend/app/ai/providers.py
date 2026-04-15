from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from ..settings import settings


@dataclass(frozen=True)
class AiSummary:
    objective: str | None
    summary_markdown: str
    summary_json: dict[str, Any] | None
    suggested_next_steps: list[str]


class AiProvider(Protocol):
    async def summarize_session(self, *, prompt: str) -> AiSummary: ...


class AiRateLimitError(RuntimeError):
    def __init__(self, *, message: str, retry_after_seconds: int | None = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class AiUpstreamError(RuntimeError):
    pass


class NoneProvider:
    async def summarize_session(self, *, prompt: str) -> AiSummary:
        return AiSummary(
            objective=None,
            summary_markdown=(
                "AI summarization is disabled (`AI_PROVIDER=none`).\n\n"
                "To enable: set `AI_PROVIDER=openai` and `OPENAI_API_KEY`."
            ),
            summary_json=None,
            suggested_next_steps=[
                "Set `AI_PROVIDER=openai` and `OPENAI_API_KEY` in `backend/.env`",
                "Re-run session summarization",
            ],
        )


class OpenAiProvider:
    def __init__(self, *, api_key: str, model: str):
        self._api_key = api_key
        self._model = model

    async def summarize_session(self, *, prompt: str) -> AiSummary:
        # Uses OpenAI-compatible Chat Completions endpoint.
        payload = {
            "model": self._model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an expert developer productivity assistant. "
                        "Given an event timeline from a coding session, infer intent "
                        "and produce a concise, structured recovery summary."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
        }

        async with httpx.AsyncClient(timeout=60) as client:
            try:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=payload,
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                status = e.response.status_code if e.response else None
                if status == 429:
                    retry_after = None
                    try:
                        ra = e.response.headers.get("retry-after")
                        retry_after = int(ra) if ra and ra.isdigit() else None
                    except Exception:
                        retry_after = None
                    raise AiRateLimitError(
                        message="OpenAI rate limit hit (429). Try again shortly.",
                        retry_after_seconds=retry_after,
                    ) from e
                raise AiUpstreamError(f"OpenAI request failed (status={status}).") from e
            except httpx.HTTPError as e:
                raise AiUpstreamError("OpenAI request failed (network error).") from e

            data = resp.json()

        content = data["choices"][0]["message"]["content"]
        # Content is expected to be JSON. We'll parse best-effort.
        try:
            import json

            obj = json.loads(content)
        except Exception:
            obj = {"summary_markdown": content}

        objective = obj.get("objective")
        summary_markdown = obj.get("summary_markdown") or obj.get("summary") or content
        next_steps = obj.get("suggested_next_steps") or obj.get("next_steps") or []

        if not isinstance(next_steps, list):
            next_steps = [str(next_steps)]

        return AiSummary(
            objective=objective if isinstance(objective, str) else None,
            summary_markdown=str(summary_markdown),
            summary_json=obj if isinstance(obj, dict) else None,
            suggested_next_steps=[str(s) for s in next_steps][:10],
        )


def get_provider() -> AiProvider:
    if settings.ai_provider.lower() == "openai":
        if not settings.openai_api_key:
            return NoneProvider()
        return OpenAiProvider(api_key=settings.openai_api_key, model=settings.openai_model)
    return NoneProvider()

