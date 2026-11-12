"""Deterministic resume diagnostics: ATS readability, keyword coverage, writing, impact.

These rules describe the resume itself. They feed ATS readiness and resume-quality advice and
help classify gaps (positioning vs ATS), but they don't add to the job-fit score, so the
same fact is never counted twice.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from app.schemas.document import ResumeDocument
from app.schemas.job import JobProfile
from app.schemas.profile import CandidateProfile
from app.scorecards.schemas import RuleOutcome
from app.services.text_utils import skill_present

Ctx = tuple[ResumeDocument, CandidateProfile, JobProfile | None]


def _bullets(doc: ResumeDocument) -> list[str]:
    return [ln.text for ln in doc.lines if ln.kind == "bullet" and ln.section == "experience"]


def _o(rule_id: str, status: str, detail: str) -> RuleOutcome:
    from app.rules.registry import get

    return RuleOutcome(rule_id=rule_id, name=get(rule_id).name, status=status, detail=detail)  # type: ignore[arg-type]


def _ratio_status(ratio: float, good: float, ok: float) -> str:
    return "pass" if ratio >= good else "warn" if ratio >= ok else "fail"


# --- ATS ---------------------------------------------------------------------------------
def ats_text(ctx: Ctx) -> RuleOutcome:
    doc = ctx[0]
    chars = len(doc.text)
    status = "pass" if chars >= 800 and len(doc.lines) >= 10 else "warn" if chars >= 300 else "fail"
    return _o("ATS-01", status, f"{len(doc.lines)} lines, {chars:,} characters extracted.")


def ats_sections(ctx: Ctx) -> RuleOutcome:
    found = {ln.section for ln in ctx[0].lines}
    need = ["experience", "education", "skills"]
    missing = [s for s in need if s not in found]
    status = "pass" if not missing else "warn" if len(missing) == 1 else "fail"
    detail = "Found experience, education and skills sections." if not missing else f"Not recognized: {', '.join(missing)}."  # fmt: skip
    return _o("ATS-02", status, detail)


_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_PHONE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")


def ats_contact(ctx: Ctx) -> RuleOutcome:
    head = " ".join(ln.text for ln in ctx[0].lines[:6])
    email, phone = bool(_EMAIL.search(head)), bool(_PHONE.search(head))
    status = "pass" if email and phone else "warn" if email or phone else "fail"
    missing = [n for n, ok in (("email", email), ("phone", phone)) if not ok]
    return _o("ATS-03", status, "Email and phone found." if not missing else f"Missing near the top: {', '.join(missing)}.")  # fmt: skip


def ats_dates(ctx: Ctx) -> RuleOutcome:
    roles = ctx[1].experience
    if not roles:
        return _o("ATS-04", "fail", "No roles were recognized.")
    bad = [e.title or e.company or "a role" for e in roles if not e.start_date]
    status = "pass" if not bad else "warn" if len(bad) < len(roles) else "fail"
    return _o("ATS-04", status, "All role dates parse." if not bad else f"Dates not readable for: {', '.join(bad[:3])}.")  # fmt: skip


def ats_titles(ctx: Ctx) -> RuleOutcome:
    roles = ctx[1].experience
    if not roles:
        return _o("ATS-05", "fail", "No roles were recognized.")
    bad = [e.company or "a role" for e in roles if not e.title]
    status = "pass" if not bad else "warn"
    return _o("ATS-05", status, f"{len(roles)} roles with titles." if not bad else f"No title found for: {', '.join(bad[:3])}.")  # fmt: skip


def ats_bullets(ctx: Ctx) -> RuleOutcome:
    lines = [ln for ln in ctx[0].lines if ln.section == "experience" and ln.kind != "heading"]
    bullets = [ln for ln in lines if ln.kind == "bullet"]
    long_paras = [ln for ln in lines if ln.kind == "text" and len(ln.text.split()) > 30]
    if not lines:
        return _o("ATS-06", "fail", "No experience content found.")
    status = "pass" if bullets and not long_paras else "warn"
    return _o("ATS-06", status, f"{len(bullets)} bullets, {len(long_paras)} long paragraphs in experience.")  # fmt: skip


def ats_length(ctx: Ctx) -> RuleOutcome:
    words = len(ctx[0].text.split())
    status = "pass" if 250 <= words <= 1200 else "warn" if 150 <= words <= 1600 else "fail"
    return _o("ATS-07", status, f"{words:,} words.")


_TITLE_STOP = {"and", "of", "the", "for", "to", "in", "a", "an", "with", "at", "senior", "sr", "staff", "lead", "principal"}  # fmt: skip


def ats_title_terms(ctx: Ctx) -> RuleOutcome:
    job = ctx[2]
    if not job or not job.title:
        return _o("ATS-08", "info", "No job title to compare.")
    core = job.title.split(",")[0]
    terms = [w for w in re.findall(r"[A-Za-z]+", core) if w.lower() not in _TITLE_STOP]
    found = [t for t in terms if re.search(rf"\b{re.escape(t)}\b", ctx[0].text, re.I)]
    ratio = len(found) / len(terms) if terms else 1.0
    return _o("ATS-08", _ratio_status(ratio, 1.0, 0.5), f"Title terms found: {len(found)}/{len(terms)} ({', '.join(terms)}).")  # fmt: skip


# --- keywords ------------------------------------------------------------------------------
def _job_skills(job: JobProfile | None) -> list[str]:
    if not job:
        return []
    seen: dict[str, None] = {}
    for r in job.requirements:
        for s in r.skills:
            seen.setdefault(s, None)
    return list(seen)


def key_skill_coverage(ctx: Ctx) -> RuleOutcome:
    skills = _job_skills(ctx[2])
    if not skills:
        return _o("KEY-01", "info", "The job names no specific skills.")
    found = [s for s in skills if skill_present(ctx[0].text, s)]
    ratio = len(found) / len(skills)
    missing = [s for s in skills if s not in found]
    detail = f"{len(found)}/{len(skills)} named skills appear." + (f" Missing: {', '.join(missing[:6])}." if missing else "")  # fmt: skip
    return _o("KEY-01", _ratio_status(ratio, 0.7, 0.4), detail)


def key_skills_in_context(ctx: Ctx) -> RuleOutcome:
    doc = ctx[0]
    skills = [s for s in _job_skills(ctx[2]) if skill_present(doc.text, s)]
    if not skills:
        return _o("KEY-02", "info", "No matched skills to check.")
    exp_text = " ".join(_bullets(doc) + [ln.text for ln in doc.lines if ln.section == "summary"])
    listed_only = [s for s in skills if not skill_present(exp_text, s)]
    status = "pass" if not listed_only else "warn"
    detail = "Matched skills also appear in experience." if not listed_only else f"Only in a skills list: {', '.join(listed_only[:6])}."  # fmt: skip
    return _o("KEY-02", status, detail)


# --- writing & impact ------------------------------------------------------------------------
_ACTION = re.compile(r"^(?:[A-Z][a-z]+ed|Led|Built|Ran|Wrote|Drove|Grew|Won|Cut|Set|Made|Owned|Shipped|Launched|Managed|Partnered|Designed|Defined|Created|Delivered|Developed|Established|Increased|Reduced|Improved|Spearheaded|Oversaw|Directed|Negotiated|Mentored|Scaled|Architected|Implemented|Migrated|Automated|Analyzed|Introduced)\b")  # fmt: skip
_FIRST_PERSON = re.compile(r"\b(I|my|me|mine)\b")
_WEAK = re.compile(r"\b(responsible for|worked on|helped( to)?|assisted( with)?|involved in|participated in|tasked with)\b", re.I)  # fmt: skip
_OUTCOME = re.compile(r"\b(increas\w*|reduc\w*|improv\w*|grew|grow\w*|sav\w*|cut|launch\w*|adopt\w*|accelerat\w*|boost\w*|doubl\w*|tripl\w*|lower\w*|rais\w*|generat\w*|deliver\w*|achiev\w*|exceed\w*)\b", re.I)  # fmt: skip


def wrt_length(ctx: Ctx) -> RuleOutcome:
    b = _bullets(ctx[0])
    if not b:
        return _o("WRT-01", "info", "No experience bullets.")
    off = [x for x in b if not 8 <= len(x.split()) <= 35]
    return _o("WRT-01", _ratio_status(1 - len(off) / len(b), 0.85, 0.6), f"{len(b) - len(off)}/{len(b)} bullets are 8–35 words.")  # fmt: skip


def wrt_action_verbs(ctx: Ctx) -> RuleOutcome:
    b = _bullets(ctx[0])
    if not b:
        return _o("WRT-02", "info", "No experience bullets.")
    ok = [x for x in b if _ACTION.match(x.strip())]
    return _o("WRT-02", _ratio_status(len(ok) / len(b), 0.8, 0.5), f"{len(ok)}/{len(b)} bullets start with an action verb.")  # fmt: skip


def wrt_first_person(ctx: Ctx) -> RuleOutcome:
    b = _bullets(ctx[0])
    hits = [x for x in b if _FIRST_PERSON.search(x)]
    return _o("WRT-03", "pass" if not hits else "warn", "No first-person bullets." if not hits else f"{len(hits)} bullets use I/my/me.")  # fmt: skip


def wrt_weak_phrases(ctx: Ctx) -> RuleOutcome:
    b = _bullets(ctx[0])
    hits = [x for x in b if _WEAK.search(x)]
    detail = "No weak phrasing found." if not hits else f"{len(hits)} bullets use weak phrasing, e.g. “{hits[0][:70]}”."  # fmt: skip
    return _o("WRT-04", "pass" if not hits else "warn", detail)


def imp_quantified(ctx: Ctx) -> RuleOutcome:
    b = _bullets(ctx[0])
    if not b:
        return _o("IMP-01", "info", "No experience bullets.")
    n = sum(bool(re.search(r"\d", x)) for x in b)
    return _o("IMP-01", _ratio_status(n / len(b), 0.5, 0.25), f"{n}/{len(b)} bullets include a number.")  # fmt: skip


def imp_outcomes(ctx: Ctx) -> RuleOutcome:
    b = _bullets(ctx[0])
    if not b:
        return _o("IMP-02", "info", "No experience bullets.")
    n = sum(bool(_OUTCOME.search(x)) for x in b)
    return _o("IMP-02", _ratio_status(n / len(b), 0.4, 0.2), f"{n}/{len(b)} bullets state a result.")  # fmt: skip


DIAGNOSTICS: tuple[Callable[[Ctx], RuleOutcome], ...] = (
    ats_text, ats_sections, ats_contact, ats_dates, ats_titles, ats_bullets, ats_length,
    ats_title_terms, key_skill_coverage, key_skills_in_context, wrt_length, wrt_action_verbs,
    wrt_first_person, wrt_weak_phrases, imp_quantified, imp_outcomes,
)  # fmt: skip

# ATS readiness weights (points). Writing and impact rules are advice, not ATS.
ATS_WEIGHTS = {"ATS-01": 25, "ATS-02": 15, "ATS-03": 10, "ATS-04": 15, "ATS-05": 10, "ATS-06": 5, "ATS-07": 5, "ATS-08": 5, "KEY-01": 10}  # fmt: skip
_STATUS_VALUE = {"pass": 1.0, "warn": 0.5, "fail": 0.0}


def run_diagnostics(
    doc: ResumeDocument, profile: CandidateProfile, job: JobProfile | None
) -> list[RuleOutcome]:
    ctx: Ctx = (doc, profile, job)
    return [fn(ctx) for fn in DIAGNOSTICS]


def ats_readiness(outcomes: list[RuleOutcome]) -> float:
    """0–100 from ATS rules; rules that don't apply ('info') drop out of the denominator."""
    total = earned = 0.0
    for o in outcomes:
        w = ATS_WEIGHTS.get(o.rule_id)
        if not w or o.status == "info":
            continue
        total += w
        earned += w * _STATUS_VALUE[o.status]
    return round(100 * earned / total, 1) if total else 0.0
