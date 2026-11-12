"""Evidence construction. Evidence text is always the verbatim resume line."""

from __future__ import annotations

from app.parsing.profile_builder import line_company_map
from app.schemas.analysis import Evidence
from app.schemas.document import ResumeDocument
from app.schemas.profile import CandidateProfile


class EvidenceBuilder:
    def __init__(self, doc: ResumeDocument, profile: CandidateProfile):
        self.lines = doc.line_map()
        self.companies = line_company_map(profile)

    def valid(self, line_ids: list[str]) -> list[str]:
        """Drop ids the model invented or that point at headings."""
        out = []
        for lid in line_ids:
            ln = self.lines.get(lid.strip())
            if ln and ln.kind != "heading" and ln.id not in out:
                out.append(ln.id)
        return out

    def build(
        self, line_ids: list[str], claim: str, strength: str = "moderate", limit: int = 3
    ) -> list[Evidence]:
        items = []
        for lid in self.valid(line_ids)[:limit]:
            ln = self.lines[lid]
            company = self.companies.get(lid)
            section = ln.section.title()
            location = f"{section} — {company}" if company else section
            if ln.page:
                location += f", page {ln.page}"
            items.append(
                Evidence(
                    claim=claim,
                    evidence=ln.text,
                    line_id=lid,
                    source_section=section,
                    source_location=location,
                    strength=strength if strength in ("strong", "moderate", "weak") else "moderate",  # type: ignore[arg-type]
                )
            )
        return items

    def text(self, line_id: str) -> str:
        ln = self.lines.get(line_id)
        return ln.text if ln else ""
