"""Small text helpers shared by matching and factuality checks."""

from __future__ import annotations

import re

_WS = re.compile(r"\s+")


def norm(text: str) -> str:
    return _WS.sub(" ", text.lower()).strip()


def contains_term(haystack: str, term: str) -> bool:
    """Case-insensitive whole-term match (handles terms with punctuation like 'C++', 'A/B')."""
    term = term.strip().lower()
    if not term:
        return False
    pattern = r"(?<![\w])" + re.escape(term) + r"(?![\w])"
    return re.search(pattern, haystack.lower()) is not None


# Common equivalent spellings for skill matching. Keys and values are lowercase.
SKILL_ALIASES: dict[str, tuple[str, ...]] = {
    "javascript": ("js",),
    "typescript": ("ts",),
    "kubernetes": ("k8s",),
    "postgresql": ("postgres",),
    "amazon web services": ("aws",),
    "aws": ("amazon web services",),
    "google cloud": ("gcp", "google cloud platform"),
    "gcp": ("google cloud", "google cloud platform"),
    "machine learning": ("ml",),
    "ml": ("machine learning",),
    "artificial intelligence": ("ai",),
    "ai": ("artificial intelligence",),
    "a/b testing": ("ab testing", "a/b tests", "experimentation"),
    "ci/cd": ("continuous integration", "continuous delivery"),
    "product requirements": ("prd", "prds", "product requirement documents"),
    "sql": ("postgresql", "mysql", "sql server"),
}


def skill_present(text: str, skill: str) -> bool:
    s = skill.strip().lower()
    if contains_term(text, s):
        return True
    return any(contains_term(text, alt) for alt in SKILL_ALIASES.get(s, ()))


def substring_of(value: str, source: str) -> bool:
    """True when value appears (whitespace/case-insensitive) in source."""
    v = norm(value).strip(" ,|-–—")
    return bool(v) and v in norm(source)
