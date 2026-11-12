"""Validated structured LLM calls.

Never trust LLM JSON blindly: every response is parsed and validated with Pydantic.
On failure we (1) retry with the validation error fed back, (2) attempt a local repair of
common JSON defects, and (3) raise LLMOutputError so callers can fail gracefully.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import get_settings
from app.core.errors import LLMOutputError
from app.core.logging import get_logger
from app.llm.provider import ChatMessage, LLMProvider, get_provider

log = get_logger("llm.structured")

PROMPT_DIR = Path(__file__).parent / "prompts"
T = TypeVar("T", bound=BaseModel)


@lru_cache
def load_prompt(name: str) -> tuple[str, str]:
    """Load ``<name>.txt`` from the prompt directory. Returns (version_id, text).

    Prompt files are split into a system part and a user template by a line containing
    only ``---USER---``.
    """
    path = PROMPT_DIR / f"{name}.txt"
    return name, path.read_text(encoding="utf-8")


def render_prompt(name: str, /, **values: str) -> tuple[str, str, str]:
    """Return (version, system, user) with ``{{key}}`` placeholders substituted."""
    version, text = load_prompt(name)
    system, _, user = text.partition("---USER---")
    for key, value in values.items():
        user = user.replace("{{" + key + "}}", value)
        system = system.replace("{{" + key + "}}", value)
    return version, system.strip(), user.strip()


_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def repair_json(text: str) -> Any:
    """Best-effort repair of common LLM JSON defects. Raises ValueError if hopeless."""
    cleaned = _THINK_RE.sub("", text).strip()
    cleaned = _FENCE_RE.sub("", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Extract the outermost JSON object.
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object found")
    candidate = cleaned[start : end + 1]
    # Remove trailing commas before closing brackets.
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise ValueError(f"unrepairable JSON: {exc.msg}") from exc


def call_structured(
    prompt_name: str,
    output_model: type[T],
    *,
    provider: LLMProvider | None = None,
    temperature: float = 0.1,
    **values: str,
) -> tuple[T, str]:
    """Run a versioned prompt and return (validated_output, prompt_version)."""
    provider = provider or get_provider()
    version, system, user = render_prompt(prompt_name, **values)
    schema = output_model.model_json_schema()
    messages = [ChatMessage("system", system), ChatMessage("user", user)]
    attempts = get_settings().llm_max_retries + 1
    last_error = ""
    for attempt in range(1, attempts + 1):
        raw = provider.chat(messages, json_schema=schema, temperature=temperature)
        try:
            return output_model.model_validate(repair_json(raw)), version
        except (ValueError, ValidationError) as exc:
            # Log only the error type/count, never the content.
            last_error = _short_error(exc)
            log.warning(
                "invalid LLM output prompt=%s attempt=%d/%d: %s",
                version,
                attempt,
                attempts,
                last_error,
            )
            messages = [
                *messages[:2],
                ChatMessage("assistant", raw[:4000]),
                ChatMessage(
                    "user",
                    "Your previous reply was not valid. Error: "
                    f"{last_error}. Reply again with ONLY valid JSON matching the schema.",
                ),
            ]
    raise LLMOutputError(
        f"The model returned invalid structured output for '{version}' after "
        f"{attempts} attempts ({last_error}). Try again or use a larger model."
    )


def _short_error(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        errs = exc.errors()[:3]
        return "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in errs)
    return str(exc)[:200]
