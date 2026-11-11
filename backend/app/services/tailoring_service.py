"""Truth-preserving resume tailoring.

Pipeline: candidate facts + job analysis → tailoring LLM (per unit) → factuality validator →
changes with decisions. Reordering of bullets and skills is done deterministically by job
relevance, so it is truthful by construction (same text, different order).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.llm.outputs import TailoringOut
from app.llm.structured import call_structured
from app.models import MatchAnalysis, ResumeVersion
from app.parsing.profile_builder import group_experience
from app.schemas.analysis import MatchResult
from app.schemas.document import DocLine, ResumeDocument
from app.schemas.job import JobProfile
from app.schemas.tailoring import Change, FactualityResult, TailoringMode
from app.scoring.semantic import SemanticIndex
from app.services import factuality, job_service, resume_service, tasks
from app.services.text_utils import norm

log = get_logger("tailoring")
PROMPT = "resume_tailoring_v1"


@dataclass(frozen=True)
class ModeConfig:
    max_rewrites_per_role: int | None
    max_roles: int | None
    reorder_bullets: bool
    reorder_skills: bool
    rules: str


MODES: dict[str, ModeConfig] = {
    "minimal": ModeConfig(
        1,
        2,
        False,
        False,
        "Only the single highest-impact rewrite per role, and only if clearly better for this job. "
        "Keep wording close to the original.",
    ),
    "recommended": ModeConfig(
        3,
        None,
        True,
        True,
        "Rewrite up to 3 bullets per role that are most relevant to this job. Preserve the "
        "overall structure and voice.",
    ),
    "aggressive": ModeConfig(
        None,
        None,
        True,
        True,
        "Rewrite every bullet that can be made more relevant, restructuring sentences "
        "substantially. Aggressive means more rewriting, NEVER new facts.",
    ),
}


def initial_decision(status: str) -> str:
    return {"SUPPORTED": "accepted", "PARTIALLY_SUPPORTED": "pending"}.get(status, "rejected")


def job_focus(job: JobProfile, result: MatchResult | None) -> str:
    parts = [f"Role: {job.title} at {job.company}".strip()]
    musts = job.by_kind("must_have")[:8]
    if musts:
        parts.append("Must-haves:\n" + "\n".join(f"- {r.text}" for r in musts))
    resps = job.by_kind("responsibility")[:6]
    if resps:
        parts.append("Responsibilities:\n" + "\n".join(f"- {r.text}" for r in resps))
    if result and result.improvements:
        parts.append(
            "Positioning advice from the analysis:\n"
            + "\n".join(f"- {i.action}" for i in result.improvements[:5])
        )
    return "\n\n".join(parts)


def _job_queries(job: JobProfile) -> list[str]:
    return [r.text for r in job.requirements if r.kind != "nice_to_have"][:25] or [job.title]


class Tailor:
    def __init__(
        self,
        doc: ResumeDocument,
        job: JobProfile,
        job_text: str,
        result: MatchResult | None,
        mode: str,
    ):
        self.doc = doc
        self.lines = doc.line_map()
        self.job = job
        self.job_text = job_text
        self.mode = MODES[mode]
        self.mode_name = mode
        self.focus = job_focus(job, result)
        self.resume_text = doc.text
        self.changes: list[Change] = []

    def _next_id(self) -> str:
        return f"C{len(self.changes) + 1}"

    # LLM rewrites -----------------------------------------------------------
    def rewrite_unit(
        self,
        label: str,
        unit: list[DocLine],
        support: list[DocLine],
        section: str,
        limit: int | None,
    ) -> None:
        if not unit:
            return
        unit_ids = {ln.id for ln in unit}
        pool_ids = unit_ids | {ln.id for ln in support}
        try:
            out, _ = call_structured(
                PROMPT,
                TailoringOut,
                mode=self.mode_name,
                mode_rules=self.mode.rules,
                job=self.focus,
                unit_label=label,
                unit_lines="\n".join(f"{ln.id}: {ln.text}" for ln in unit),
                support_lines="\n".join(f"{ln.id}: {ln.text}" for ln in support) or "(none)",
                temperature=0.3,
            )
        except AppError as exc:
            log.warning("tailoring unit failed section=%s: %s", section, type(exc).__name__)
            return
        used: set[str] = set()
        count = 0
        for rw in out.rewrites:
            if limit is not None and count >= limit:
                break
            lid = rw.line_id.strip()
            if lid not in unit_ids or lid in used:
                continue
            original = self.lines[lid].text
            proposed = " ".join(rw.new_text.split())
            if not proposed or norm(proposed) == norm(original):
                continue
            used.add(lid)
            supporting = [s for s in rw.supporting_line_ids if s in pool_ids and s != lid]
            sources = [original] + [self.lines[s].text for s in supporting]
            fact = factuality.validate(proposed, original, sources, self.resume_text, self.job_text)
            self.changes.append(
                Change(
                    id=self._next_id(),
                    type="summary" if section == "summary" else "rewrite",
                    section=section,
                    target_line_ids=[lid],
                    original=original,
                    proposed=proposed,
                    reason=rw.reason,
                    supporting_line_ids=[lid, *supporting],
                    factuality=fact,
                    decision=initial_decision(fact.status),  # type: ignore[arg-type]
                )
            )
            count += 1

    # Deterministic reorders -------------------------------------------------
    def reorder_bullets(
        self, role_label: str, bullets: list[DocLine], index: SemanticIndex
    ) -> None:
        if len(bullets) < 3:
            return
        scores = index.relevance([b.text for b in bullets], _job_queries(self.job))
        order = sorted(range(len(bullets)), key=lambda i: -scores[i])
        # Only propose when the most relevant bullet is meaningfully more relevant than the current lead.
        if order[0] == 0 or scores[order[0]] - scores[0] < 0.05:
            return
        new = [bullets[i] for i in order]
        self.changes.append(
            Change(
                id=self._next_id(),
                type="reorder",
                section="experience",
                target_line_ids=[b.id for b in bullets],
                new_order=[b.id for b in new],
                original="\n".join(f"• {b.text}" for b in bullets),
                proposed="\n".join(f"• {b.text}" for b in new),
                reason=f"Moves the bullets most relevant to this role higher in {role_label}.",
                supporting_line_ids=[b.id for b in bullets],
                factuality=FactualityResult(
                    status="SUPPORTED",
                    deterministic_status="SUPPORTED",
                    llm_explanation="Reordering only — no wording changed.",
                ),
                decision="accepted",
            )
        )

    def reorder_skills(self, line: DocLine, index: SemanticIndex) -> None:
        text = line.text
        label = ""
        if m := re.match(r"^([A-Z][\w &/-]{1,30}:)\s*", text):
            label = m.group(1) + " "
            body = text[m.end() :]
        else:
            body = text
        if re.search(r"[A-Z][\w &/-]{1,30}:", body):
            return  # multiple labeled groups — leave as is
        seps = [", ", " | ", " • ", "; ", " · "]
        sep = max(seps, key=body.count)
        if body.count(sep) < 2:
            return
        items = [i.strip() for i in body.split(sep) if i.strip()]
        jd = self.job_text.lower()
        rel = index.relevance(items, _job_queries(self.job))
        order = sorted(range(len(items)), key=lambda i: (items[i].lower() not in jd, -rel[i]))
        new_items = [items[i] for i in order]
        if new_items == items:
            return
        trailing = "." if body.rstrip().endswith(".") and not new_items[-1].endswith(".") else ""
        new_text = label + sep.join(it.rstrip(".") for it in new_items) + trailing
        if sorted(i.rstrip(".") for i in new_items) != sorted(i.rstrip(".") for i in items):
            return
        self.changes.append(
            Change(
                id=self._next_id(),
                type="skills",
                section="skills",
                target_line_ids=[line.id],
                original=text,
                proposed=new_text,
                reason="Lists the skills this job asks for first. Same skills, new order.",
                supporting_line_ids=[line.id],
                factuality=FactualityResult(
                    status="SUPPORTED",
                    deterministic_status="SUPPORTED",
                    llm_explanation="Reordering only — the same skills are listed.",
                ),
                decision="accepted",
            )
        )

    def run(self, progress=lambda _m: None) -> list[Change]:
        lines = [ln for ln in self.doc.lines if ln.kind != "heading"]
        bullets_all = [ln for ln in lines if ln.section == "experience" and ln.kind == "bullet"]
        skills = [ln for ln in lines if ln.section == "skills"]

        summary = [ln for ln in lines if ln.section == "summary"]
        if not summary:
            summary = [ln for ln in lines if ln.section == "header" and len(ln.text) > 120]
        if summary:
            progress("Tailoring summary")
            self.rewrite_unit(
                "SUMMARY LINES TO REWRITE (rewrite as a summary targeted to this job, using only facts in the summary and the supporting lines)",
                summary,
                bullets_all + skills,
                "summary",
                limit=len(summary),
            )

        roles = group_experience([ln for ln in lines if ln.section == "experience"])
        if self.mode.max_roles is not None:
            roles = roles[: self.mode.max_roles]
        for i, (headers, bullets) in enumerate(roles, start=1):
            if not bullets:
                continue
            role_label = " / ".join(h.text for h in headers) or f"role {i}"
            progress(f"Tailoring role {i} of {len(roles)}")
            self.rewrite_unit(
                f"ROLE BULLETS TO REWRITE ({role_label})",
                bullets,
                headers,
                "experience",
                limit=self.mode.max_rewrites_per_role,
            )

        if self.mode.reorder_bullets or self.mode.reorder_skills:
            progress("Reordering by relevance")
            index = SemanticIndex(self.doc.lines)
            if self.mode.reorder_bullets:
                for headers, bullets in group_experience(
                    [ln for ln in lines if ln.section == "experience"]
                ):
                    label = headers[0].text if headers else "this role"
                    self.reorder_bullets(label, [b for b in bullets if b.kind == "bullet"], index)
            if self.mode.reorder_skills:
                for ln in skills:
                    self.reorder_skills(ln, index)
        return self.changes


def factuality_report(changes: list[Change]) -> dict:
    statuses = [c.factuality.status if c.factuality else "UNSUPPORTED" for c in changes]
    return {
        "supported": statuses.count("SUPPORTED"),
        "partially_supported": statuses.count("PARTIALLY_SUPPORTED"),
        "unsupported": statuses.count("UNSUPPORTED"),
        "accepted": sum(c.decision == "accepted" for c in changes),
        "pending": sum(c.decision == "pending" for c in changes),
        "rejected": sum(c.decision == "rejected" for c in changes),
        "total": len(changes),
    }


def version_name(original_filename: str, job: JobProfile) -> str:
    stem = original_filename.rsplit(".", 1)[0]
    stem = re.sub(r"(?i)[_ -]*(resume|cv)$", "", stem) or "Resume"

    def clean(s: str) -> str:
        return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")[:40]

    parts = [clean(stem), "Resume_Tailored", clean(job.company), clean(job.title)]
    return "_".join(p for p in parts if p)


def _execute(version_id: str) -> None:
    db = SessionLocal()
    try:
        v = db.get(ResumeVersion, version_id)
        if v is None:
            return
        v.status, v.progress = "running", "Starting"
        db.commit()

        def progress(msg: str) -> None:
            v.progress = msg
            db.commit()

        doc = resume_service.load_document(v.original_resume)
        job = job_service.load_job_profile(v.job)
        result = None
        if v.match_id:
            m = db.get(MatchAnalysis, v.match_id)
            if m and m.result:
                result = MatchResult.model_validate(m.result)
        try:
            changes = Tailor(doc, job, v.job.description, result, v.tailoring_mode).run(progress)
        except Exception as exc:
            log.exception("tailoring failed id=%s", version_id)
            v.status, v.progress = "failed", "Failed"
            v.error = (
                exc.message
                if isinstance(exc, AppError)
                else f"Unexpected error ({type(exc).__name__})."
            )
            db.commit()
            return
        v.changes = [c.model_dump(mode="json") for c in changes]
        v.factuality_report = factuality_report(changes)
        v.content = render_content(doc, changes)
        v.status, v.progress = "complete", "Complete"
        db.commit()
        log.info("tailoring complete id=%s changes=%d", version_id, len(changes))
    finally:
        db.close()


def render_content(doc: ResumeDocument, changes: list[Change]) -> dict:
    """Tailored content: final text per line and final order, using accepted changes only."""
    texts = {ln.id: ln.text for ln in doc.lines}
    order = [ln.id for ln in doc.lines]
    for c in changes:
        if c.decision != "accepted":
            continue
        if c.type == "reorder":
            slots = [order.index(i) for i in c.target_line_ids]
            for slot, new_id in zip(sorted(slots), c.new_order, strict=True):
                order[slot] = new_id
        else:
            texts[c.target_line_ids[0]] = c.proposed
    kinds = {ln.id: (ln.kind, ln.section, ln.bullet_prefix) for ln in doc.lines}
    return {
        "lines": [
            {"id": lid, "text": texts[lid], "kind": kinds[lid][0], "section": kinds[lid][1]}
            for lid in order
        ]
    }


def create_version(
    db: Session, resume_id: str, match_id: str, mode: TailoringMode
) -> ResumeVersion:
    resume = resume_service.get_resume(db, resume_id)
    m = db.get(MatchAnalysis, match_id)
    if not m or m.resume_id != resume_id:
        raise NotFoundError("Analysis not found for this resume.")
    if m.status != "complete":
        raise AppError("Finish the job analysis before tailoring.")
    job = job_service.load_job_profile(m.job)
    v = ResumeVersion(
        original_resume_id=resume.id,
        job_id=m.job_id,
        match_id=m.id,
        tailoring_mode=mode,
        name=version_name(resume.filename, job),
        prompt_versions={"tailoring": PROMPT, "factuality": factuality.PROMPT},
    )
    db.add(v)
    db.commit()
    tasks.submit(_execute, v.id)
    return v


def get_version(db: Session, version_id: str) -> ResumeVersion:
    v = db.get(ResumeVersion, version_id)
    if not v:
        raise NotFoundError("Resume version not found.")
    return v


def list_versions(db: Session) -> list[ResumeVersion]:
    return list(db.scalars(select(ResumeVersion).order_by(ResumeVersion.created_at.desc())))


def _load_changes(v: ResumeVersion) -> list[Change]:
    return [Change.model_validate(c) for c in (v.changes or [])]


def _save_changes(db: Session, v: ResumeVersion, changes: list[Change]) -> None:
    doc = resume_service.load_document(v.original_resume)
    v.changes = [c.model_dump(mode="json") for c in changes]
    v.factuality_report = factuality_report(changes)
    v.content = render_content(doc, changes)
    v.exported_file_path = None  # content changed; previous export is stale
    db.commit()


def set_decision(db: Session, version_id: str, change_id: str, decision: str) -> ResumeVersion:
    v = get_version(db, version_id)
    changes = _load_changes(v)
    change = next((c for c in changes if c.id == change_id), None)
    if not change:
        raise NotFoundError("Change not found.")
    if decision == "accepted" and change.factuality and change.factuality.status == "UNSUPPORTED":
        raise AppError(
            "Unsupported changes cannot be accepted. Edit the text so it only uses facts from "
            "your resume, then re-validate."
        )
    change.decision = decision  # type: ignore[assignment]
    _save_changes(db, v, changes)
    return v


def edit_change(db: Session, version_id: str, change_id: str, proposed: str) -> ResumeVersion:
    """User edits a change; it is re-validated before it can be accepted."""
    v = get_version(db, version_id)
    changes = _load_changes(v)
    change = next((c for c in changes if c.id == change_id), None)
    if not change:
        raise NotFoundError("Change not found.")
    if change.type in ("reorder", "skills"):
        raise AppError("Reordering changes cannot be edited; accept or reject them.")
    doc = resume_service.load_document(v.original_resume)
    line_map = doc.line_map()
    sources = [line_map[i].text for i in change.supporting_line_ids if i in line_map] or [
        change.original
    ]
    proposed = " ".join(proposed.split())
    change.proposed = proposed
    change.user_edited = True
    change.factuality = factuality.validate(
        proposed, change.original, sources, doc.text, v.job.description
    )
    # An edit by the user to supported text is accepted; anything else needs a decision.
    change.decision = initial_decision(change.factuality.status)  # type: ignore[assignment]
    _save_changes(db, v, changes)
    return v


def revalidate(db: Session, version_id: str, change_ids: list[str] | None = None) -> ResumeVersion:
    v = get_version(db, version_id)
    changes = _load_changes(v)
    doc = resume_service.load_document(v.original_resume)
    line_map = doc.line_map()
    for c in changes:
        if c.type in ("reorder", "skills") or (change_ids and c.id not in change_ids):
            continue
        sources = [line_map[i].text for i in c.supporting_line_ids if i in line_map] or [c.original]
        c.factuality = factuality.validate(
            c.proposed, c.original, sources, doc.text, v.job.description
        )
        if c.factuality.status == "UNSUPPORTED":
            c.decision = "rejected"
        elif (
            c.factuality.status == "PARTIALLY_SUPPORTED"
            and c.decision == "accepted"
            and not c.user_edited
        ):
            c.decision = "pending"
    _save_changes(db, v, changes)
    return v


def mark_interrupted(db: Session) -> None:
    """On startup, tailoring jobs left running by a previous process cannot resume."""
    for row in db.scalars(
        select(ResumeVersion).where(ResumeVersion.status.in_(("pending", "running")))
    ):
        row.status, row.progress = "failed", "Failed"
        row.error = "Interrupted by a server restart. Start tailoring again."
    db.commit()
