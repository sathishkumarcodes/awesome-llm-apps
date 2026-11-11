"""LLM provider abstraction.

The rest of the app depends only on ``LLMProvider``. Ollama is the MVP implementation;
a cloud provider can be added by implementing ``chat`` and registering it in ``get_provider``.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.core.errors import LLMUnavailableError
from app.core.logging import get_logger

log = get_logger("llm")


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


class LLMProvider(abc.ABC):
    name: str = "abstract"

    @property
    @abc.abstractmethod
    def model(self) -> str: ...

    @abc.abstractmethod
    def chat(
        self,
        messages: list[ChatMessage],
        *,
        json_schema: dict[str, Any] | None = None,
        temperature: float = 0.1,
    ) -> str:
        """Return the assistant message text. When json_schema is given, the provider
        should constrain output to JSON matching it if the backend supports that."""

    @abc.abstractmethod
    def health(self) -> dict[str, Any]: ...


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = httpx.Client(
            base_url=settings.ollama_base_url.rstrip("/"),
            timeout=httpx.Timeout(settings.ollama_timeout_seconds, connect=5.0),
        )

    @property
    def model(self) -> str:
        return self._settings.ollama_model

    def chat(self, messages, *, json_schema=None, temperature=0.1) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
            "think": self._settings.ollama_think,
            "options": {"temperature": temperature, "num_ctx": self._settings.ollama_num_ctx},
        }
        if json_schema is not None:
            payload["format"] = json_schema
        try:
            resp = self._client.post("/api/chat", json=payload)
        except httpx.HTTPError as exc:
            raise LLMUnavailableError(
                f"Could not reach Ollama at {self._settings.ollama_base_url}. "
                "Is `ollama serve` running?"
            ) from exc
        if resp.status_code == 404:
            raise LLMUnavailableError(
                f"Ollama model '{self.model}' is not available. Run `ollama pull {self.model}`."
            )
        if resp.status_code >= 400:
            # Do not include request body (contains resume data) in errors/logs.
            raise LLMUnavailableError(f"Ollama returned HTTP {resp.status_code}.")
        data = resp.json()
        log.info(
            "ollama chat model=%s prompt_tokens=%s output_tokens=%s duration_s=%.1f",
            self.model,
            data.get("prompt_eval_count"),
            data.get("eval_count"),
            (data.get("total_duration") or 0) / 1e9,
        )
        return data.get("message", {}).get("content", "")

    def health(self) -> dict[str, Any]:
        try:
            resp = self._client.get("/api/tags", timeout=5.0)
            resp.raise_for_status()
        except httpx.HTTPError:
            return {"provider": self.name, "reachable": False, "model": self.model}
        names = [m.get("name", "") for m in resp.json().get("models", [])]
        available = any(n == self.model or n.split(":")[0] == self.model for n in names)
        return {
            "provider": self.name,
            "reachable": True,
            "model": self.model,
            "model_available": available,
            "installed_models": names,
        }


class FutureCloudProvider(LLMProvider):
    """Placeholder registration point for a hosted LLM. Deliberately not functional:
    the MVP never sends resume data to external services."""

    name = "cloud"

    def __init__(self, settings: Settings):
        self._settings = settings

    @property
    def model(self) -> str:
        return "unconfigured"

    def chat(self, messages, *, json_schema=None, temperature=0.1) -> str:
        raise LLMUnavailableError("Cloud LLM providers are not enabled in this build.")

    def health(self) -> dict[str, Any]:
        return {"provider": self.name, "reachable": False, "model": self.model}


_PROVIDERS: dict[str, type[LLMProvider]] = {
    "ollama": OllamaProvider,
    "cloud": FutureCloudProvider,
}


@lru_cache
def get_provider() -> LLMProvider:
    settings = get_settings()
    cls = _PROVIDERS.get(settings.llm_provider.lower())
    if cls is None:
        raise LLMUnavailableError(f"Unknown LLM_PROVIDER '{settings.llm_provider}'.")
    return cls(settings)  # type: ignore[call-arg]
