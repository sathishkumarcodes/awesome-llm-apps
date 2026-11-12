"""LLM provider abstraction.

The rest of the app depends only on ``LLMProvider`` via ``get_provider()``. Three backends:

- ``ollama``: local models (qwen3, llama, ...). Nothing leaves the machine.
- ``anthropic``: Claude models via the Anthropic API.
- ``openai``: OpenAI models via the OpenAI API.

The active (provider, model) is chosen in the UI and persisted in ``<data_dir>/llm_selection.json``.
Background jobs pin the choice that was active when they were submitted (see ``pinned``).
"""

from __future__ import annotations

import abc
import contextlib
import contextvars
import json
import re
import threading
import time
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.core.errors import AppError, LLMOutputError, LLMUnavailableError
from app.core.logging import get_logger

log = get_logger("llm")


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass(frozen=True)
class ModelChoice:
    provider: str
    model: str


class LLMProvider(abc.ABC):
    name: str = "abstract"

    def __init__(self, settings: Settings, model: str):
        self._settings = settings
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    @abc.abstractmethod
    def chat(
        self,
        messages: list[ChatMessage],
        *,
        json_schema: dict[str, Any] | None = None,
        temperature: float = 0.1,
    ) -> str:
        """Return the assistant message text. When json_schema is given, the provider
        constrains output to JSON matching it where the backend supports that."""

    @abc.abstractmethod
    def health(self) -> dict[str, Any]: ...


# --- Ollama (local) -------------------------------------------------------------------
class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, settings: Settings, model: str):
        super().__init__(settings, model)
        self._client = httpx.Client(
            base_url=settings.ollama_base_url.rstrip("/"),
            timeout=httpx.Timeout(settings.ollama_timeout_seconds, connect=5.0),
        )

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
        except httpx.TimeoutException as exc:
            raise LLMUnavailableError(
                f"The local model '{self.model}' did not finish within "
                f"{self._settings.ollama_timeout_seconds:.0f}s. Try a smaller or hosted model."
            ) from exc
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

    def installed_models(self) -> list[str]:
        resp = self._client.get("/api/tags", timeout=5.0)
        resp.raise_for_status()
        return sorted(m.get("name", "") for m in resp.json().get("models", []))

    def health(self) -> dict[str, Any]:
        try:
            names = self.installed_models()
        except httpx.HTTPError:
            return {"provider": self.name, "reachable": False, "model": self.model}
        available = any(n == self.model or n.split(":")[0] == self.model for n in names)
        return {
            "provider": self.name,
            "reachable": True,
            "model": self.model,
            "model_available": available,
            "installed_models": names,
        }


# --- schema helpers for hosted structured outputs ----------------------------------------
# Keywords the hosted structured-output modes reject. Pydantic still validates them locally.
_DROP_KEYS = {
    "default", "title", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
    "multipleOf", "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems",
}  # fmt: skip


def strict_schema(schema: Any) -> Any:
    """Return a copy of a Pydantic JSON schema in the strict form hosted APIs accept:
    every object closed (additionalProperties: false) with all properties required, and
    unsupported constraint keywords removed."""
    if isinstance(schema, list):
        return [strict_schema(s) for s in schema]
    if not isinstance(schema, dict):
        return schema
    out = {k: strict_schema(v) for k, v in schema.items() if k not in _DROP_KEYS}
    if "properties" in schema:
        out["properties"] = {k: strict_schema(v) for k, v in schema["properties"].items()}
        out["required"] = list(schema["properties"])
        out["additionalProperties"] = False
    elif out.get("type") == "object":
        out["additionalProperties"] = False
    return out


def _split_system(messages: list[ChatMessage]) -> tuple[str, list[dict[str, str]]]:
    system = "\n\n".join(m.content for m in messages if m.role == "system")
    rest = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
    return system, rest


# --- Anthropic (Claude) ---------------------------------------------------------------
# Models that support structured outputs (JSON outputs via output_config.format).
_CLAUDE_STRUCTURED = re.compile(
    r"^claude-(fable|mythos|opus|sonnet|haiku)-5|^claude-(opus-4-8|haiku-4-5)$"
)
# Models that accept output_config.effort.
_CLAUDE_EFFORT = re.compile(r"^claude-(fable|mythos|opus|sonnet|haiku)-5|^claude-opus-4-8$")
# Models that take the server-side refusal fallback ("default" routing).
_CLAUDE_FALLBACK = {"claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}  # fmt: skip
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, settings: Settings, model: str):
        super().__init__(settings, model)
        import anthropic

        self._sdk = anthropic
        self._client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key or None,
            timeout=settings.cloud_timeout_seconds,
            max_retries=2,
        )

    def chat(self, messages, *, json_schema=None, temperature=0.1) -> str:
        # Sampling parameters (temperature) are not sent: current Claude models reject them.
        sdk = self._sdk
        system, msgs = _split_system(messages)
        output_config: dict[str, Any] = {}
        if json_schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": strict_schema(json_schema)}
        if _CLAUDE_EFFORT.match(self.model):
            output_config["effort"] = self._settings.cloud_effort
        kwargs: dict[str, Any] = dict(
            model=self.model, max_tokens=16000, system=system, messages=msgs
        )
        if output_config:
            kwargs["output_config"] = output_config
        started = time.monotonic()
        try:
            if self.model in _CLAUDE_FALLBACK:
                # On a safety decline, the API retries on a suitable fallback model in-call.
                resp = self._client.beta.messages.create(
                    betas=[_FALLBACK_BETA], fallbacks="default", **kwargs
                )
            else:
                resp = self._client.messages.create(**kwargs)
        except sdk.AuthenticationError as exc:
            raise LLMUnavailableError(
                "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
            ) from exc
        except sdk.PermissionDeniedError as exc:
            raise LLMUnavailableError(f"This API key can't use {self.model}.") from exc
        except sdk.NotFoundError as exc:
            raise LLMUnavailableError(f"Claude model '{self.model}' was not found.") from exc
        except sdk.RateLimitError as exc:
            raise LLMUnavailableError(
                "Claude rate limit reached. Wait a moment and try again."
            ) from exc
        except sdk.BadRequestError as exc:
            raise LLMUnavailableError(f"Claude rejected the request: {exc.message}"[:300]) from exc
        except sdk.APIStatusError as exc:
            raise LLMUnavailableError(
                f"Claude API error (HTTP {exc.status_code}). Try again."
            ) from exc
        except sdk.APIConnectionError as exc:
            raise LLMUnavailableError(
                "Could not reach the Anthropic API. Check your connection."
            ) from exc
        log.info(
            "anthropic chat model=%s served_by=%s input_tokens=%s output_tokens=%s duration_s=%.1f stop=%s",
            self.model,
            resp.model,
            resp.usage.input_tokens,
            resp.usage.output_tokens,
            time.monotonic() - started,
            resp.stop_reason,
        )
        if resp.stop_reason == "refusal":
            raise LLMOutputError(f"{self.model} declined this request.")
        return "".join(b.text for b in resp.content if b.type == "text")

    def list_models(self) -> list[dict[str, str]]:
        models = [
            {"id": m.id, "label": m.display_name or m.id}
            for m in self._client.models.list(limit=100)
            if _CLAUDE_STRUCTURED.match(m.id)
        ]
        return models

    def health(self) -> dict[str, Any]:
        return {
            "provider": self.name,
            "reachable": True,
            "model": self.model,
            "model_available": True,
        }


# --- OpenAI ---------------------------------------------------------------------------
_OPENAI_CHAT = re.compile(r"^(gpt-|o\d|chatgpt-)")
_OPENAI_EXCLUDE = ("audio", "realtime", "tts", "transcribe", "image", "search", "embedding", "instruct", "codex", "moderation")  # fmt: skip


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, settings: Settings, model: str):
        super().__init__(settings, model)
        import openai

        self._sdk = openai
        self._client = openai.OpenAI(
            api_key=settings.openai_api_key or None,
            timeout=settings.cloud_timeout_seconds,
            max_retries=2,
        )

    def chat(self, messages, *, json_schema=None, temperature=0.1) -> str:
        # temperature is not sent: OpenAI reasoning models reject non-default values.
        sdk = self._sdk
        kwargs: dict[str, Any] = dict(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
        )
        if json_schema is not None:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "output",
                    "schema": strict_schema(json_schema),
                    "strict": True,
                },
            }
        started = time.monotonic()
        try:
            try:
                resp = self._client.chat.completions.create(**kwargs)
            except sdk.BadRequestError:
                if json_schema is None:
                    raise
                # Some models don't take strict schemas; fall back to plain JSON mode.
                kwargs["response_format"] = {"type": "json_object"}
                resp = self._client.chat.completions.create(**kwargs)
        except sdk.AuthenticationError as exc:
            raise LLMUnavailableError(
                "The OpenAI API key was rejected. Check OPENAI_API_KEY."
            ) from exc
        except sdk.PermissionDeniedError as exc:
            raise LLMUnavailableError(f"This API key can't use {self.model}.") from exc
        except sdk.NotFoundError as exc:
            raise LLMUnavailableError(f"OpenAI model '{self.model}' was not found.") from exc
        except sdk.RateLimitError as exc:
            raise LLMUnavailableError(
                "OpenAI rate limit or quota reached. Check your account."
            ) from exc
        except sdk.BadRequestError as exc:
            raise LLMUnavailableError(f"OpenAI rejected the request: {exc.message}"[:300]) from exc
        except sdk.APIStatusError as exc:
            raise LLMUnavailableError(
                f"OpenAI API error (HTTP {exc.status_code}). Try again."
            ) from exc
        except sdk.APIConnectionError as exc:
            raise LLMUnavailableError(
                "Could not reach the OpenAI API. Check your connection."
            ) from exc
        usage = resp.usage
        log.info(
            "openai chat model=%s input_tokens=%s output_tokens=%s duration_s=%.1f",
            self.model,
            usage.prompt_tokens if usage else None,
            usage.completion_tokens if usage else None,
            time.monotonic() - started,
        )
        choice = resp.choices[0]
        if getattr(choice.message, "refusal", None):
            raise LLMOutputError(f"{self.model} declined this request.")
        return choice.message.content or ""

    def list_models(self) -> list[dict[str, str]]:
        models = sorted(self._client.models.list(), key=lambda m: m.created, reverse=True)
        return [
            {"id": m.id, "label": m.id}
            for m in models
            if _OPENAI_CHAT.match(m.id) and not any(x in m.id for x in _OPENAI_EXCLUDE)
        ]

    def health(self) -> dict[str, Any]:
        return {
            "provider": self.name,
            "reachable": True,
            "model": self.model,
            "model_available": True,
        }


# --- registry, selection, and pinning ---------------------------------------------------
@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str
    local: bool
    cls: type[LLMProvider]


PROVIDERS: dict[str, ProviderInfo] = {
    "ollama": ProviderInfo("ollama", "Local (Ollama)", True, OllamaProvider),
    "anthropic": ProviderInfo("anthropic", "Claude (Anthropic)", False, AnthropicProvider),
    "openai": ProviderInfo("openai", "OpenAI", False, OpenAIProvider),
}

_pinned: contextvars.ContextVar[ModelChoice | None] = contextvars.ContextVar(
    "llm_pinned", default=None
)
_lock = threading.Lock()


def _selection_path():
    return get_settings().data_dir / "llm_selection.json"


def get_active_choice() -> ModelChoice:
    """The model chosen in the UI, or the .env default (LLM_PROVIDER / OLLAMA_MODEL)."""
    try:
        data = json.loads(_selection_path().read_text())
        if data.get("provider") in PROVIDERS and data.get("model"):
            return ModelChoice(data["provider"], data["model"])
    except (OSError, ValueError):
        pass
    s = get_settings()
    provider = s.llm_provider.lower() if s.llm_provider.lower() in PROVIDERS else "ollama"
    return ModelChoice(provider, s.ollama_model)


def current_choice() -> ModelChoice:
    return _pinned.get() or get_active_choice()


@contextlib.contextmanager
def pinned(choice: ModelChoice) -> Iterator[None]:
    """Run a block (e.g. a background job) against a fixed model, whatever the UI selects."""
    token = _pinned.set(choice)
    try:
        yield
    finally:
        _pinned.reset(token)


@lru_cache(maxsize=16)
def _provider_for(provider: str, model: str) -> LLMProvider:
    info = PROVIDERS.get(provider)
    if info is None:
        raise LLMUnavailableError(f"Unknown LLM provider '{provider}'.")
    try:
        return info.cls(get_settings(), model)
    except AppError:
        raise
    except Exception as exc:  # SDK construction fails without credentials
        raise LLMUnavailableError(f"{info.label} is not configured: {exc}"[:300]) from exc


def get_provider() -> LLMProvider:
    choice = current_choice()
    return _provider_for(choice.provider, choice.model)


_models_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_MODELS_TTL = 60.0


def _provider_models(pid: str, refresh: bool = False) -> dict[str, Any]:
    """Models a provider offers right now, with availability and a reason when unavailable."""
    info = PROVIDERS[pid]
    cached = _models_cache.get(pid)
    if cached and not refresh and time.monotonic() - cached[0] < _MODELS_TTL:
        return cached[1]
    entry: dict[str, Any] = {"id": pid, "label": info.label, "local": info.local, "available": False, "reason": "", "models": []}  # fmt: skip
    s = get_settings()
    key_var = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}.get(pid, "")
    try:
        if pid == "ollama":
            names = OllamaProvider(s, s.ollama_model).installed_models()
            entry["models"] = [{"id": n, "label": n} for n in names]
            entry["available"] = bool(names)
            entry["reason"] = (
                "" if names else "No local models installed. Run `ollama pull qwen3:4b`."
            )
        else:
            provider = info.cls(s, "")
            entry["models"] = provider.list_models()  # type: ignore[attr-defined]
            entry["available"] = bool(entry["models"])
            entry["reason"] = "" if entry["models"] else "No supported models on this account."
    except httpx.HTTPError:
        entry["reason"] = (
            "Ollama isn't running. Start it with `ollama serve` or open the Ollama app."
        )
    except Exception as exc:
        name = type(exc).__name__
        if key_var and (
            "Authentication" in name or "Credentials" in name or "api_key" in str(exc).lower()
        ):
            entry["reason"] = f"Add {key_var} to .env and restart the backend."
        elif "Connection" in name:
            entry["reason"] = f"Could not reach the {info.label} API."
        else:
            entry["reason"] = f"{info.label} unavailable ({name})."
        log.info("provider %s unavailable: %s", pid, name)
    _models_cache[pid] = (time.monotonic(), entry)
    return entry


def list_models(refresh: bool = False) -> dict[str, Any]:
    active = get_active_choice()
    return {
        "active": asdict(active),
        "providers": [_provider_models(pid, refresh) for pid in PROVIDERS],
    }


def set_active_choice(provider: str, model: str) -> ModelChoice:
    if provider not in PROVIDERS:
        raise AppError(f"Unknown provider '{provider}'.")
    entry = _provider_models(provider, refresh=True)
    if not entry["available"]:
        raise AppError(entry["reason"] or f"{PROVIDERS[provider].label} is unavailable.")
    if model not in {m["id"] for m in entry["models"]}:
        raise AppError(f"Model '{model}' is not available from {PROVIDERS[provider].label}.")
    choice = ModelChoice(provider, model)
    with _lock:
        path = _selection_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(choice)))
    log.info("active model set provider=%s model=%s", provider, model)
    return choice
