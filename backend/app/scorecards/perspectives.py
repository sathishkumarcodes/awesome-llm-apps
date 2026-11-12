"""Recruiter and hiring-manager perspectives on a criterion's evidence level.

The evidence level is judged once per criterion. The two perspectives then read it differently,
by explicit rules rather than a second free-form score:
  REC-02  evidence that appears only in a skills list reads one level lower to a screener;
  REC-03  evidence only from roles that ended more than 6 years ago reads one level lower;
  HM-02   the hiring-manager level (from the model's depth judgment) stays within one step.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.schemas.document import ResumeDocument
from app.schemas.profile import CandidateProfile

STALE_YEARS = 6


@dataclass
class EvidenceContext:
    section: dict[str, str] = field(default_factory=dict)
    end_year: dict[str, int] = field(default_factory=dict)  # line id -> role end year
    role_label: dict[str, str] = field(default_factory=dict)  # line id -> "Title, 2020–now"

    @classmethod
    def build(cls, doc: ResumeDocument, profile: CandidateProfile) -> EvidenceContext:
        ctx = cls(section={ln.id: ln.section for ln in doc.lines})
        this_year = date.today().year
        for e in profile.experience:
            end = this_year if e.is_current or not e.end_date else int(e.end_date[:4])
            start = e.start_date[:4] if e.start_date else "?"
            label = f"{e.title or e.company}, {start}–{'now' if end == this_year and (e.is_current or not e.end_date) else end}"
            for lid in [*e.header_line_ids, *(b.source.line_id for b in e.bullets)]:
                ctx.end_year[lid] = end
                ctx.role_label[lid] = label
        return ctx

    def describe(self, line_id: str) -> str:
        sec = self.section.get(line_id, "other")
        role = self.role_label.get(line_id)
        return f"{sec}, {role}" if role else sec


def _num(level: str) -> int | None:
    return None if level == "unknown" else int(level)


def bound_level(level: str, other: str) -> tuple[str, bool]:
    """HM-02: keep a perspective level within one step of the evidence level."""
    base, val = _num(level), _num(other)
    if base is None:
        return "unknown", other != "unknown"
    if val is None:
        return level, False
    if base == 0:  # no evidence: no perspective can read it higher
        return "0", val != 0
    bounded = max(base - 1, min(base + 1, val, 5), 0)
    return str(bounded), bounded != val


def recruiter_level(level: str, line_ids: list[str], ctx: EvidenceContext) -> tuple[str, list[str]]:
    """Evidence level as a recruiter skimming the resume would read it."""
    base = _num(level)
    if base is None or base == 0 or not line_ids:
        return level, []
    notes: list[str] = []
    sections = {ctx.section.get(i, "other") for i in line_ids}
    if sections <= {"skills"}:
        notes.append(
            "REC-02: only listed in the skills section, which reads weaker than a described achievement."
        )
    years = [ctx.end_year[i] for i in line_ids if i in ctx.end_year]
    in_summary = "summary" in sections
    if years and not in_summary and max(years) < date.today().year - STALE_YEARS:
        notes.append(f"REC-03: evidence is from roles that ended over {STALE_YEARS} years ago.")
    return str(max(base - (1 if notes else 0), 1)), notes
