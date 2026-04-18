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
                "To enable: set either `AI_PROVIDER=openai` with `OPENAI_API_KEY` "
                "or `AI_PROVIDER=mistral` with `MISTRAL_API_KEY`."
            ),
            summary_json=None,
            suggested_next_steps=[
                "Set provider credentials in `backend/.env`",
                "Re-run session summarization",
            ],
        )


class OpenAiCompatibleProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        endpoint: str,
        provider_name: str,
        use_response_format: bool,
    ):
        self._api_key = api_key
        self._model = model
        self._endpoint = endpoint
        self._provider_name = provider_name
        self._use_response_format = use_response_format

    async def summarize_session(self, *, prompt: str) -> AiSummary:
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
        }
        if self._use_response_format:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=60) as client:
            try:
                resp = await client.post(
                    self._endpoint,
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
                        message=(
                            f"{self._provider_name} rate limit hit (429). "
                            "Try again shortly."
                        ),
                        retry_after_seconds=retry_after,
                    ) from e
                raise AiUpstreamError(
                    f"{self._provider_name} request failed (status={status})."
                ) from e
            except httpx.HTTPError as e:
                raise AiUpstreamError(
                    f"{self._provider_name} request failed (network error)."
                ) from e

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


class OpenAiProvider(OpenAiCompatibleProvider):
    def __init__(self, *, api_key: str, model: str):
        super().__init__(
            api_key=api_key,
            model=model,
            endpoint="https://api.openai.com/v1/chat/completions",
            provider_name="OpenAI",
            use_response_format=True,
        )


class MistralProvider(OpenAiCompatibleProvider):
    def __init__(self, *, api_key: str, model: str):
        super().__init__(
            api_key=api_key,
            model=model,
            endpoint="https://api.mistral.ai/v1/chat/completions",
            provider_name="Mistral",
            use_response_format=False,
        )


def get_provider() -> AiProvider:
    provider = settings.ai_provider.lower()

    if provider == "openai":
        if not settings.openai_api_key:
            return NoneProvider()
        return OpenAiProvider(api_key=settings.openai_api_key, model=settings.openai_model)

    if provider == "mistral":
        if not settings.mistral_api_key:
            return NoneProvider()
        return MistralProvider(api_key=settings.mistral_api_key, model=settings.mistral_model)

    return NoneProvider()

