"""Generate a job-specific hiring scorecard from a JobProfile. Never reads a resume.

Pipeline: requirement pool → model drafts 8–12 consolidated criteria → validator repairs
(supported, consolidated, covered, labeled) → model writes a rubric per criterion (in parallel
where the model allows) → deterministic weights → final validation.

Without a usable model, a deterministic generator groups requirements by category so the
app still produces a valid (if plainer) scorecard.
"""

from __future__ import annotations

from collections import defaultdict

from app.core.errors import AppError
from app.core.logging import get_logger
from app.llm.outputs import RubricOut, ScorecardDraftOut
from app.llm.parallel import pmap
from app.llm.structured import call_structured
from app.parsing.job_parser import is_logistics
from app.schemas.job import JobProfile
from app.scorecards.schemas import (
    EligibilityConstraint,
    HiringCriterion,
    Rubric,
    ScorecardContent,
)
from app.scorecards.validator import (
    _CATEGORY_NAMES,
    MIN_CRITERIA,
    PoolItem,
    criterion_from_requirement,
    default_rubric,
    finalize,
    repair,
)
from app.scorecards.weighting import assign_weights

log = get_logger("scorecard")
GEN_PROMPT = "scorecard_generation_v1"
RUBRIC_PROMPT = "criterion_rubric_v1"
PROMPT_VERSIONS = {"generation": GEN_PROMPT, "rubric": RUBRIC_PROMPT}
MAX_RESPONSIBILITIES = 10

_VALID_CATEGORIES = {
    "experience",
    "technical",
    "domain",
    "leadership",
    "product",
    "customer",
    "stakeholder",
    "impact",
    "education",
    "certification",
    "seniority",
    "other",
}
_OWNER_BY_CATEGORY = {
    "experience": "recruiter",
    "education": "recruiter",
    "certification": "recruiter",
    "seniority": "both",
    "domain": "both",
    "technical": "both",
    "leadership": "hiring_manager",
    "product": "hiring_manager",
    "customer": "hiring_manager",
    "stakeholder": "hiring_manager",
    "impact": "hiring_manager",
    "other": "both",
}


def requirement_pool(job: JobProfile) -> tuple[dict[str, PoolItem], list[EligibilityConstraint]]:
    """Requirements a scorecard may draw on, plus eligibility constraints set aside."""
    pool: dict[str, PoolItem] = {}
    eligibility: list[EligibilityConstraint] = []
    responsibilities = 0
    for r in job.requirements:
        if r.kind in ("must_have", "preferred") and is_logistics(r.text):
            eligibility.append(
                EligibilityConstraint(
                    id=f"E{len(eligibility) + 1}",
                    requirement_id=r.id,
                    text=r.text,
                    is_hard_requirement=r.kind == "must_have",
                )
            )
            continue
        kind = "preferred" if r.kind == "nice_to_have" else r.kind
        if kind == "responsibility":
            if is_logistics(r.text) or responsibilities >= MAX_RESPONSIBILITIES:
                continue
            responsibilities += 1
        pool[r.id] = PoolItem(r.id, kind, r.category, r.text)
    for i, s in enumerate(job.inferred_signals, start=1):
        pool[f"S{i}"] = PoolItem(f"S{i}", "inferred", "other", s.signal)
    return pool, eligibility


# --- model path -------------------------------------------------------------------------------
def _draft(job: JobProfile, pool: dict[str, PoolItem]) -> ScorecardDraftOut:
    lines = "\n".join(f"{p.id} ({p.kind}, {p.category}): {p.text}" for p in pool.values())
    out, _ = call_structured(
        GEN_PROMPT,
        ScorecardDraftOut,
        title=job.title or "Unknown role",
        company=job.company or "unknown company",
        level=job.seniority_level or job.seniority or "unspecified",
        work_mode=job.work_mode,
        requirements=lines,
        temperature=0.0,
    )
    return out


def _from_draft(draft: ScorecardDraftOut) -> list[HiringCriterion]:
    out = []
    for i, d in enumerate(draft.criteria, start=1):
        if not d.name.strip():
            continue
        category = d.category.strip().lower()
        out.append(
            HiringCriterion(
                id=f"D{i}",
                name=d.name.strip()[:90],
                description=d.description.strip(),
                category=category if category in _VALID_CATEGORIES else "other",  # type: ignore[arg-type]
                source_requirement_ids=[s.strip() for s in d.source_requirement_ids],
                importance=d.importance,
                evaluation_owner=d.evaluation_owner,
                rubric=default_rubric(d.name),
                rationale=d.rationale.strip(),
            )
        )
    return out


def _rubric(job: JobProfile, c: HiringCriterion, pool: dict[str, PoolItem]) -> HiringCriterion:
    reqs = "\n".join(
        f"- ({pool[r].kind}) {pool[r].text}" for r in c.source_requirement_ids if r in pool
    )
    try:
        out, _ = call_structured(
            RUBRIC_PROMPT,
            RubricOut,
            title=job.title or "Unknown role",
            company=job.company or "unknown company",
            level=job.seniority_level or "unspecified",
            name=c.name,
            category=c.category,
            importance=c.importance,
            description=c.description,
            requirements=reqs,
            temperature=0.0,
        )
    except AppError as exc:
        log.warning("rubric failed for %s (%s); using default", c.name, exc.message[:80])
        return c
    rubric = Rubric(
        level_5=out.level_5.strip(),
        level_4=out.level_4.strip(),
        level_3=out.level_3.strip(),
        level_2=out.level_2.strip(),
        level_1=out.level_1.strip(),
    )
    return c.model_copy(
        update={
            "rubric": rubric,
            "recruiter_guidance": out.recruiter_guidance.strip(),
            "hiring_manager_guidance": out.hiring_manager_guidance.strip(),
        }
    )


# --- deterministic path -------------------------------------------------------------------------
def deterministic_criteria(pool: dict[str, PoolItem]) -> list[HiringCriterion]:
    """Group requirements by category: a plain but valid scorecard without a model."""
    groups: dict[str, list[PoolItem]] = defaultdict(list)
    for p in pool.values():
        groups["inferred" if p.kind == "inferred" else p.category].append(p)
    out: list[HiringCriterion] = []
    for category, items in groups.items():
        musts = sum(p.kind == "must_have" for p in items)
        if category == "inferred":
            name, cat, importance = "Inferred success factors", "other", "medium"
        else:
            name = _CATEGORY_NAMES.get(category, "Other qualifications")
            cat = category if category in _VALID_CATEGORIES else "other"
            importance = (
                "critical"
                if musts >= 2
                else "high"
                if musts
                else "medium"
                if any(p.kind == "responsibility" for p in items)
                else "low"
            )
        out.append(
            HiringCriterion(
                id=f"G{len(out) + 1}",
                name=name,
                description="; ".join(p.text for p in items)[:400],
                category=cat,  # type: ignore[arg-type]
                source_requirement_ids=[p.id for p in items],
                importance=importance,  # type: ignore[arg-type]
                evaluation_owner=_OWNER_BY_CATEGORY.get(cat, "both"),  # type: ignore[arg-type]
                rubric=default_rubric(name),
                rationale=f"The job lists {len(items)} requirement(s) in this area ({musts} required).",
            )
        )
    return out


def split_to_minimum(
    criteria: list[HiringCriterion], pool: dict[str, PoolItem]
) -> list[HiringCriterion]:
    """Split the largest category groups into single-requirement criteria until there are
    MIN_CRITERIA, when the job has enough requirements. Never invents criteria."""
    criteria = list(criteria)
    while len(criteria) < MIN_CRITERIA:
        splittable = [c for c in criteria if len(c.source_requirement_ids) > 1]
        if not splittable:
            break
        big = max(splittable, key=lambda c: len(c.source_requirement_ids))
        # Peel off the requirement that is most specific (longest text) as its own criterion.
        rid = max(big.source_requirement_ids, key=lambda r: len(pool[r].text))
        rest = [r for r in big.source_requirement_ids if r != rid]
        idx = criteria.index(big)
        criteria[idx] = big.model_copy(
            update={
                "source_requirement_ids": rest,
                "description": "; ".join(pool[r].text for r in rest)[:400],
            }
        )
        criteria.append(criterion_from_requirement(pool[rid], f"G{len(criteria) + 1}"))
    return criteria


# --- entry point --------------------------------------------------------------------------------
def generate(
    job: JobProfile, *, use_model: bool = True, progress=lambda _m: None
) -> ScorecardContent:
    pool, eligibility = requirement_pool(job)
    if not pool:
        raise AppError("The job has no requirements to build a scorecard from.")

    criteria: list[HiringCriterion] = []
    role_family = summary = ""
    generated_by = "deterministic"
    if use_model:
        progress("Drafting criteria from the job description")
        try:
            draft = _draft(job, pool)
            criteria = _from_draft(draft)
            role_family, summary = draft.role_family.strip(), draft.summary.strip()
            generated_by = "model" if criteria else "deterministic"
        except AppError as exc:
            log.warning(
                "scorecard draft failed (%s); using deterministic generator", exc.message[:80]
            )
    if not criteria:
        criteria = split_to_minimum(deterministic_criteria(pool), pool)

    progress("Validating and consolidating criteria")
    criteria, checks = repair(criteria, pool)
    explicit = sum(p.kind != "inferred" for p in pool.values())
    if len(criteria) < MIN_CRITERIA <= explicit:
        # Too coarse for a detailed job: split broad criteria (never invent new ones).
        criteria, split_checks = repair(split_to_minimum(criteria, pool), pool, merge=False)
        checks = [*[c for c in checks if c.name in ("supported", "protected", "consolidated")], *[c for c in split_checks if c.name not in ("supported", "protected", "consolidated")]]  # fmt: skip
    if not criteria:  # model output entirely unusable
        criteria, checks = repair(split_to_minimum(deterministic_criteria(pool), pool), pool)
        generated_by = "deterministic"

    if generated_by == "model":
        progress("Writing evaluation rubrics")
        criteria = pmap(lambda c: _rubric(job, c, pool), criteria)

    kinds = {p.id: p.kind for p in pool.values()}
    content = ScorecardContent(
        role_family=role_family or job.department or "",
        seniority=job.seniority_level or job.seniority or "",
        summary=summary,
        criteria=assign_weights(criteria, kinds),
        eligibility=eligibility,
        validation=checks,
        generated_by=generated_by,  # type: ignore[arg-type]
    )
    return finalize(content, pool)
