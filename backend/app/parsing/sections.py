"""Section heading detection and bullet/date helpers shared by the PDF and DOCX parsers."""

from __future__ import annotations

import re

SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "summary": (
        "summary",
        "professional summary",
        "career summary",
        "executive summary",
        "profile",
        "professional profile",
        "about",
        "about me",
        "objective",
        "career objective",
        "overview",
        "introduction",
    ),
    "experience": (
        "experience",
        "professional experience",
        "work experience",
        "relevant experience",
        "employment",
        "employment history",
        "work history",
        "career history",
        "professional history",
        "experience highlights",
    ),
    "skills": (
        "skills",
        "technical skills",
        "key skills",
        "core skills",
        "core competencies",
        "competencies",
        "expertise",
        "areas of expertise",
        "skills & tools",
        "skills and tools",
        "tools",
        "technologies",
        "tools & technologies",
        "skills & expertise",
        "skills summary",
    ),
    "education": ("education", "academic background", "education & training", "academics"),
    "certifications": (
        "certifications",
        "certification",
        "certificates",
        "licenses",
        "licenses & certifications",
        "certifications & training",
        "training",
    ),
    "projects": ("projects", "selected projects", "key projects", "personal projects"),
    "awards": ("awards", "honors", "awards & honors", "honors & awards", "recognition"),
    "other": (
        "publications",
        "volunteer",
        "volunteering",
        "volunteer experience",
        "interests",
        "languages",
        "patents",
        "activities",
        "leadership",
        "additional information",
        "additional",
        "affiliations",
        "speaking",
    ),
}

_ALIAS_LOOKUP = {
    alias: section for section, aliases in SECTION_ALIASES.items() for alias in aliases
}

BULLET_CHARS = "•●▪■◦‣∙·–—-*►▶➢✓✔o"
_BULLET_RE = re.compile(r"^\s*([•●▪■◦‣∙·►▶➢✓✔]|[-–—*](?=\s)|o(?=\s{1,3}[A-Z]))\s*")


def normalize_heading(text: str) -> str:
    t = text.strip().strip(":").strip()
    t = re.sub(r"\s+", " ", t).lower()
    t = t.replace(" and ", " & ")
    return t


def classify_heading(text: str) -> str | None:
    """Return the canonical section name if ``text`` looks like a section heading."""
    if not text or len(text) > 45:
        return None
    norm = normalize_heading(text)
    if norm in _ALIAS_LOOKUP:
        return _ALIAS_LOOKUP[norm]
    # Handle "& " vs "and " variants and spaced capitals like "E X P E R I E N C E"
    collapsed = norm.replace(" ", "")
    for alias, section in _ALIAS_LOOKUP.items():
        if alias.replace(" ", "") == collapsed:
            return section
    return None


def split_bullet(text: str) -> tuple[str, str]:
    """Return (bullet_prefix, remaining_text)."""
    m = _BULLET_RE.match(text)
    if not m:
        return "", text.strip()
    return text[: m.end()], text[m.end() :].strip()


_MONTHS = {
    m: i + 1
    for i, names in enumerate(
        [
            ("jan", "january"),
            ("feb", "february"),
            ("mar", "march"),
            ("apr", "april"),
            ("may",),
            ("jun", "june"),
            ("jul", "july"),
            ("aug", "august"),
            ("sep", "sept", "september"),
            ("oct", "october"),
            ("nov", "november"),
            ("dec", "december"),
        ]
    )
    for m in names
}
_MONTH_PAT = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
_DATE_PAT = rf"(?:{_MONTH_PAT}\s*,?\s*\d{{4}}|\d{{1,2}}/\d{{4}}|\d{{4}})"
_END_PAT = rf"(?:{_DATE_PAT}|present|current|now|today|ongoing)"
DATE_RANGE_RE = re.compile(
    rf"(?P<start>{_DATE_PAT})\s*(?:-|–|—|to|until|through)\s*(?P<end>{_END_PAT})",
    re.IGNORECASE,
)


def _parse_point(text: str) -> tuple[int, int] | None:
    t = text.strip().lower().rstrip(".")
    if t in ("present", "current", "now", "today", "ongoing"):
        return None
    m = re.match(r"(\d{1,2})/(\d{4})", t)
    if m:
        return int(m.group(2)), max(1, min(12, int(m.group(1))))
    m = re.match(r"([a-z]+)\.?\s*,?\s*(\d{4})", t)
    if m and m.group(1) in _MONTHS:
        return int(m.group(2)), _MONTHS[m.group(1)]
    m = re.match(r"(\d{4})", t)
    if m:
        return int(m.group(1)), 1
    return None


def parse_date_range(text: str, today: tuple[int, int]) -> dict | None:
    """Find a date range in text. Returns dict with ISO start/end, months, is_current."""
    m = DATE_RANGE_RE.search(text)
    if not m:
        return None
    start = _parse_point(m.group("start"))
    if start is None:
        return None
    end = _parse_point(m.group("end"))
    is_current = end is None
    end_point = end or today
    # A bare year as an end ("2019 - 2021") means through the end of that year.
    if end is not None and re.fullmatch(r"\d{4}", m.group("end").strip()):
        end_point = (end[0], 12)
    months = (end_point[0] - start[0]) * 12 + (end_point[1] - start[1]) + 1
    if months <= 0 or months > 600:
        return None
    return {
        "start": f"{start[0]:04d}-{start[1]:02d}",
        "end": None if is_current else f"{end_point[0]:04d}-{end_point[1]:02d}",
        "is_current": is_current,
        "months": months,
        "text": m.group(0),
    }


def merged_months(ranges: list[tuple[str, str | None]], today: tuple[int, int]) -> int:
    """Total months covered by possibly-overlapping (start, end) ISO ranges."""
    spans: list[tuple[int, int]] = []
    for start, end in ranges:
        sy, sm = (int(x) for x in start.split("-"))
        ey, em = (int(x) for x in end.split("-")) if end else today
        spans.append((sy * 12 + sm, ey * 12 + em))
    if not spans:
        return 0
    spans.sort()
    total = 0
    cur_s, cur_e = spans[0]
    for s, e in spans[1:]:
        if s <= cur_e + 1:
            cur_e = max(cur_e, e)
        else:
            total += cur_e - cur_s + 1
            cur_s, cur_e = s, e
    return total + cur_e - cur_s + 1
