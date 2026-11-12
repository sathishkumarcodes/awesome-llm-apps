"""Shared test setup: an isolated data directory and a scriptable fake LLM."""

from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="jobmatch-test-"))

import pytest

from app.core.errors import AppError
from app.llm import provider as provider_module
from app.llm.provider import LLMProvider

FIXTURES = Path(__file__).parent / "fixtures"


def schema_instance(schema: dict, defs: dict | None = None) -> Any:
    """Minimal valid instance of a JSON schema (first enum value, empty lists)."""
    defs = defs if defs is not None else schema.get("$defs", {})
    if "$ref" in schema:
        return schema_instance(defs[schema["$ref"].split("/")[-1]], defs)
    if "anyOf" in schema:
        opts = [o for o in schema["anyOf"] if o.get("type") != "null"] or schema["anyOf"]
        return schema_instance(opts[0], defs)
    if "enum" in schema:
        return schema["enum"][0]
    t = schema.get("type")
    if t == "object" or "properties" in schema:
        return {k: schema_instance(v, defs) for k, v in schema.get("properties", {}).items()}
    if t == "array":
        return []
    if t == "string":
        return "stub"
    if t in ("number", "integer"):
        return 50
    if t == "boolean":
        return False
    return None


Handler = Callable[[str, str, dict], Any]  # (system, user, schema) -> dict | None


class FakeLLM(LLMProvider):
    """Answers each call with handler(system, user, schema), or a schema-valid default.

    A handler may return None to fall through to the default, or raise AppError."""

    name = "fake"

    def __init__(self, handler: Handler | None = None):
        self._model = "fake-model"
        self.handler = handler
        self.calls: list[tuple[str, str]] = []

    def chat(self, messages, *, json_schema=None, temperature=0.1) -> str:
        system = next((m.content for m in messages if m.role == "system"), "")
        user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        self.calls.append((system, user))
        out = self.handler(system, user, json_schema or {}) if self.handler else None
        if out is None:
            out = schema_instance(json_schema or {})
        return json.dumps(out)

    def health(self) -> dict:
        return {"provider": "fake", "reachable": True, "model": self._model}


class NoLLM(FakeLLM):
    def chat(self, messages, *, json_schema=None, temperature=0.1) -> str:
        raise AppError("no model in this test")


@pytest.fixture
def fake_llm(monkeypatch):
    """Install a FakeLLM; tests set .handler as needed."""
    fake = FakeLLM()
    monkeypatch.setattr(provider_module, "_provider_for", lambda _p, _m: fake)
    return fake


@pytest.fixture
def no_llm(monkeypatch):
    fake = NoLLM()
    monkeypatch.setattr(provider_module, "_provider_for", lambda _p, _m: fake)
    return fake


@pytest.fixture
def sample_doc():
    from app.parsing.profile_builder import build_profile
    from app.services import resume_service

    doc = resume_service.parse_file(FIXTURES / "sample_resume.docx", "sample_resume.docx", "docx")
    return doc, build_profile(doc)


def parse_job_without_llm(text: str):
    """Deterministic job parsing (the model is unavailable)."""
    from unittest import mock

    from app.services import job_service

    with mock.patch.object(job_service, "call_structured", side_effect=AppError("no model")):
        return job_service.parse_job(text)
