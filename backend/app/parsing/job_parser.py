"""Deterministic job description structuring (the LLM refines this in job_service)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.parsing.sections import split_bullet

_HEADING_KINDS: list[tuple[str, tuple[str, ...]]] = [
    (
        "preferred",
        (
            "preferred",
            "nice to have",
            "nice-to-have",
            "bonus",
            "pluses",
            "a plus",
            "additional qualifications",
            "extra credit",
        ),
    ),
    (
        "must_have",
        (
            "requirements",
            "qualifications",
            "what you'll need",
            "what you will need",
            "what you bring",
            "what we're looking for",
            "what we are looking for",
            "who you are",
            "you have",
            "must have",
            "about you",
            "required skills",
            "your experience",
            "you might be a fit",
            "you may be a good fit",
            "skills and experience",
            "experience you'll need",
        ),
    ),
    (
        "responsibility",
        (
            "responsibilities",
            "what you'll do",
            "what you will do",
            "the role",
            "in this role",
            "your role",
            "duties",
            "day to day",
            "day-to-day",
            "your impact",
            "what you'll own",
            "you will",
            "the opportunity",
            "what you'll be doing",
        ),
    ),
    (
        "ignore",
        (
            "benefits",
            "perks",
            "about us",
            "about the company",
            "who we are",
            "compensation",
            "salary",
            "pay range",
            "equal opportunity",
            "eeo",
            "why join",
            "why you'll love",
            "our values",
            "our mission",
            "how to apply",
            "life at",
        ),
    ),
]

PREFERRED_CUE = re.compile(
    r"\b(preferred|nice[- ]to[- ]have|bonus|is a plus|a plus|plus if|ideally)\b", re.I
)
MUST_CUE = re.compile(r"\b(required|must|minimum|at least)\b", re.I)
YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*years?", re.I)
REMOTE_RE = re.compile(r"\bremote\b", re.I)
HYBRID_RE = re.compile(r"\bhybrid\b", re.I)
ONSITE_RE = re.compile(r"\b(on[- ]?site|in[- ]office|in office)\b", re.I)
LOCATION_RE = re.compile(r"^\s*location\s*[:\-]\s*(.+)$", re.I | re.M)


@dataclass
class JdLine:
    n: int
    text: str
    heading: str  # nearest heading text
    section_kind: str  # must_have | preferred | responsibility | ignore | unknown
    is_bullet: bool


def heading_kind(text: str) -> str | None:
    t = text.lower().strip().rstrip(":").strip()
    if len(t) > 70 or len(t.split()) > 9:
        return None
    for kind, keys in _HEADING_KINDS:
        if any(k in t for k in keys):
            return kind
    return None


def _is_heading(raw: str, is_bullet: bool) -> bool:
    t = raw.strip()
    if is_bullet or not t:
        return False
    if t.endswith(":") and len(t) <= 70:
        return True
    return heading_kind(t) is not None and len(t.split()) <= 7 and not t.endswith(".")


def split_lines(text: str) -> list[JdLine]:
    out: list[JdLine] = []
    heading, kind = "", "unknown"
    for raw in text.replace("\r", "").split("\n"):
        raw = raw.strip()
        if not raw:
            continue
        prefix, body = split_bullet(raw)
        is_bullet = bool(prefix)
        if _is_heading(body, is_bullet):
            heading = body.rstrip(":")
            kind = heading_kind(body) or "unknown"
            continue
        # Long paragraphs: split into sentences so requirements can be assessed individually.
        parts = [body]
        if len(body) > 220:
            parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", body) if s.strip()]
        for part in parts:
            out.append(JdLine(len(out) + 1, part, heading, kind, is_bullet))
    return out


def deterministic_years(text: str) -> float | None:
    m = YEARS_RE.search(text)
    if not m:
        return None
    years = float(m.group(1))
    return years if 0 < years <= 30 else None


def deterministic_work_mode(text: str) -> str:
    if HYBRID_RE.search(text):
        return "hybrid"
    if REMOTE_RE.search(text):
        return "remote"
    if ONSITE_RE.search(text):
        return "onsite"
    return "unknown"


def deterministic_location(text: str) -> str:
    m = LOCATION_RE.search(text)
    return m.group(1).strip()[:120] if m else ""


def line_kind(line: JdLine) -> str:
    """Deterministic kind for a line: explicit cue words beat the section heading."""
    if line.section_kind == "ignore":
        return "ignore"
    if PREFERRED_CUE.search(line.text):
        return "preferred"
    if line.section_kind in ("must_have", "preferred", "responsibility"):
        return line.section_kind
    if MUST_CUE.search(line.text) or deterministic_years(line.text):
        return "must_have"
    return "unknown"
