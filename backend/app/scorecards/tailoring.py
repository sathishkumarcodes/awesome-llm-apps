"""Scorecard → tailoring: what rewriting should surface, and what it must not try to fix.

Tailoring prioritizes criteria with a *positioning* gap (the resume has the evidence but
communicates it weakly), keeps strengths visible, and is told which criteria are genuine
qualification or evidence gaps so it never tries to "fill" them by rewording.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.scorecards.schemas import EvaluationContent, ScorecardContent
from app.scorecards.validator import tokens


@dataclass
class Target:
    criterion_id: str
    name: str
    weight: float
    description: str
    line_ids: list[str]


@dataclass
class TailoringTargets:
    positioning: list[Target] = field(default_factory=list)
    strengths: list[Target] = field(default_factory=list)
    real_gaps: list[str] = field(default_factory=list)  # names; never fill by rewording

    @classmethod
    def build(cls, card: ScorecardContent, ev: EvaluationContent) -> TailoringTargets:
        by_id = {r.criterion_id: r for r in ev.results}
        out = cls()
        for c in sorted(card.criteria, key=lambda c: -c.weight):
            r = by_id.get(c.id)
            if r is None:
                continue
            ids = [e.line_id for e in r.evidence if e.source == "resume"]
            t = Target(c.id, c.name, c.weight, c.description, ids)
            if r.tailoring_can_fix and ids:
                out.positioning.append(t)
            elif r.level in ("5", "4") and ids:
                out.strengths.append(t)
            elif r.gap_type in ("qualification", "evidence"):
                out.real_gaps.append(c.name)
        return out

    @property
    def all(self) -> list[Target]:
        return [*self.positioning, *self.strengths]

    def focus_text(self) -> str:
        parts = []
        if self.positioning:
            parts.append(
                "PRIORITY: criteria where the resume HAS evidence but states it weakly (surface these):\n"
                + "\n".join(
                    f"- {t.name} ({t.weight:g}% of the scorecard); evidence lines {', '.join(t.line_ids)}"
                    for t in self.positioning[:6]
                )
            )
        if self.strengths:
            parts.append(
                "Keep visible (already strong): " + ", ".join(t.name for t in self.strengths[:5])
            )
        if self.real_gaps:
            parts.append(
                "DO NOT try to cover these by rewording; the resume doesn't show them and nothing may be added: "
                + ", ".join(self.real_gaps[:6])
            )
        return "\n\n".join(parts)

    def line_hints(self) -> dict[str, list[str]]:
        hints: dict[str, list[str]] = {}
        for t in self.all:
            for lid in t.line_ids:
                hints.setdefault(lid, []).append(t.name)
        return hints

    def queries(self) -> list[str]:
        """Relevance queries for reordering, weighted toward the scorecard's priorities."""
        return [f"{t.name}. {t.description}" for t in sorted(self.all, key=lambda t: -t.weight)][
            :12
        ]

    def criteria_for(self, line_ids: list[str], proposed: str) -> list[str]:
        """Criteria a change serves: those whose evidence lines it touches, or (for summaries)
        whose name terms it states."""
        touched = set(line_ids)
        hit = [t.criterion_id for t in self.all if touched & set(t.line_ids)]
        if not hit:
            words = tokens(proposed)
            hit = [
                t.criterion_id
                for t in self.all
                if (n := tokens(t.name)) and len(n & words) / len(n) >= 0.5
            ]
        return list(dict.fromkeys(hit))
