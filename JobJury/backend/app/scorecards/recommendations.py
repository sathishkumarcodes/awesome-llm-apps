"""Recommendation, hard-requirement gate, clarification questions and improvements.

decide() is not a single threshold:
  1. ADV-01  a confirmed unmet hard requirement → PROBABLY SKIP, whatever the score;
  2. ADV-02  if important criteria lack evidence and answering would change the decision
             (what-if: those criteria at level 4) → NEEDS CLARIFICATION;
  3. otherwise fit bands, adjusted for recruiter visibility, weak critical criteria, and how
     much a truthful rewrite could add (positioning gaps).
"""

from __future__ import annotations

from app.scorecards.schemas import (
    DECISION_LABELS,
    Blocker,
    ClarificationQuestion,
    CriterionResult,
    EligibilityConstraint,
    HiringCriterion,
    Improvement,
    Recommendation,
    Scores,
)
from app.scorecards.scoring import fit_with_levels

APPLY_FIT = 75.0
TAILOR_FIT = 60.0
BORDERLINE_FIT = 45.0
RECRUITER_VISIBLE = 70.0
POSITIONING_SHARE = 8.0
CLARIFY_SHARE = 15.0
CONFIG = {
    "apply_fit": APPLY_FIT,
    "tailor_fit": TAILOR_FIT,
    "borderline_fit": BORDERLINE_FIT,
    "recruiter_visible": RECRUITER_VISIBLE,
    "positioning_share": POSITIONING_SHARE,
    "clarify_share": CLARIFY_SHARE,
}
_ORDER = ["PROBABLY_SKIP", "BORDERLINE", "APPLY_TAILOR_FIRST", "APPLY"]


def blockers(
    criteria: list[HiringCriterion],
    results: list[CriterionResult],
    eligibility: list[EligibilityConstraint],
    eligibility_answers: dict[str, str],
) -> list[Blocker]:
    """ADV-01. Only confirmed facts block: the candidate said no to a hard requirement or a
    required condition. Missing keywords, missing evidence, transferable experience, inferred
    criteria and unanswered eligibility questions never block."""
    by_id = {r.criterion_id: r for r in results}
    out = []
    for c in criteria:
        r = by_id.get(c.id)
        if r and c.is_hard_requirement and c.is_explicit and r.classification == "confirmed_absent":
            answer = next((e.original_text for e in r.evidence if e.source == "clarification"), "")
            out.append(
                Blocker(
                    criterion_id=c.id,
                    requirement_text="; ".join(c.source_requirement_texts) or c.description,
                    candidate_evidence=answer or "You confirmed you don't meet this.",
                    explanation=f"“{c.name}” is a non-negotiable requirement for this job, and you confirmed you don't meet it.",
                )
            )
    for e in eligibility:
        if e.is_hard_requirement and eligibility_answers.get(e.id) == "no":
            out.append(
                Blocker(
                    constraint_id=e.id,
                    requirement_text=e.text,
                    candidate_evidence="You answered that you can't meet this condition.",
                    explanation="The job states this as a requirement, and you said you can't meet it.",
                )
            )
    return out


def _score_decision(scores: Scores, fit: float, critical_weak: int, positioning: float) -> str:
    recruiter = scores.recruiter
    if fit >= APPLY_FIT:
        if (
            (recruiter is not None and recruiter < RECRUITER_VISIBLE)
            or positioning >= POSITIONING_SHARE
            or critical_weak
        ):
            decision = "APPLY_TAILOR_FIRST"
        else:
            decision = "APPLY"
    elif fit >= TAILOR_FIT:
        decision = "APPLY_TAILOR_FIRST" if positioning >= POSITIONING_SHARE else "BORDERLINE"
    elif fit >= BORDERLINE_FIT:
        decision = "BORDERLINE"
    else:
        decision = "PROBABLY_SKIP"
    if critical_weak >= 2 and _ORDER.index(decision) > _ORDER.index("BORDERLINE"):
        decision = "BORDERLINE"
    return decision


def decide(
    criteria: list[HiringCriterion],
    results: list[CriterionResult],
    scores: Scores,
    blocking: list[Blocker],
) -> Recommendation:
    by_id = {r.criterion_id: r for r in results}
    pairs = [(c, by_id[c.id]) for c in criteria if c.id in by_id]
    strengths = [c for c, r in pairs if r.level in ("5", "4")]
    critical_weak = sum(
        1
        for c, r in pairs
        if c.importance == "critical" and r.level in ("0", "1") and r.gap_type == "qualification"
    )
    positioning = sum(
        c.weight for c, r in pairs if r.gap_type == "positioning" and r.tailoring_can_fix
    )
    open_evidence = [
        (c, r)
        for c, r in pairs
        if r.gap_type == "evidence"
        and r.clarified_level is None
        and c.importance in ("critical", "high")
    ]
    why: list[str] = []

    if blocking:
        b = blocking[0]
        return Recommendation(
            decision="PROBABLY_SKIP",
            label=DECISION_LABELS["PROBABLY_SKIP"],
            headline="A non-negotiable requirement isn't met.",
            why=[
                b.explanation,
                f"Requirement: “{b.requirement_text}”",
                *(["Other strengths don't offset this."] if strengths else []),
            ],
        )

    fit = scores.overall_fit if scores.overall_fit is not None else 0.0
    decision = _score_decision(scores, fit, critical_weak, positioning)

    open_weight = sum(c.weight for c, _ in open_evidence)
    if open_evidence and open_weight >= CLARIFY_SHARE and decision != "APPLY":
        optimistic = (
            fit_with_levels(criteria, results, {c.id: "4" for c, _ in open_evidence}) or 0.0
        )
        if _score_decision(scores, optimistic, critical_weak, positioning) != decision:
            names = ", ".join(c.name for c, _ in open_evidence[:3])
            return Recommendation(
                decision="NEEDS_CLARIFICATION",
                label=DECISION_LABELS["NEEDS_CLARIFICATION"],
                headline="Answer a few questions first: they could change the recommendation.",
                why=[
                    f"Your resume doesn't show {names} ({open_weight:g}% of the scorecard).",
                    f"Fit is {fit:g}/100 as written; it could be about {optimistic:g}/100 if you have that experience.",
                    "Not shown on the resume doesn't mean you lack it. Answer the questions below.",
                ],
            )

    if strengths:
        why.append("Strongest evidence: " + ", ".join(c.name for c in strengths[:3]) + ".")
    weak = [
        c for c, r in pairs if r.level in ("0", "1", "2") and c.importance in ("critical", "high")
    ]
    if weak:
        why.append("Weakest on important criteria: " + ", ".join(c.name for c in weak[:3]) + ".")
    if (
        scores.recruiter is not None
        and scores.hiring_manager is not None
        and scores.recruiter + 10 <= scores.hiring_manager
    ):
        why.append(
            "A recruiter would see less than a hiring manager: the resume undersells relevant work."
        )
    if positioning >= POSITIONING_SHARE:
        why.append(f"Truthful repositioning could strengthen {positioning:g}% of the scorecard.")
    if scores.provisional:
        why.append("Provisional: important criteria have no resume evidence yet.")
    headline = {
        "APPLY": "Strong, well-evidenced fit. Apply.",
        "APPLY_TAILOR_FIRST": "Good fit. Tailor the resume first so it's visible.",
        "BORDERLINE": "Partial fit. Apply only if the gaps are acceptable to you.",
        "PROBABLY_SKIP": "Important requirements aren't shown. Probably skip.",
    }[decision]
    why.insert(
        0,
        f"Overall fit {fit:g}/100 (recruiter {scores.recruiter if scores.recruiter is not None else '—'}, hiring manager {scores.hiring_manager if scores.hiring_manager is not None else '—'}).",
    )
    return Recommendation(
        decision=decision,  # type: ignore[arg-type]
        label=DECISION_LABELS[decision],
        headline=headline,
        why=why,
    )


def clarification_questions(
    criteria: list[HiringCriterion],
    results: list[CriterionResult],
    eligibility: list[EligibilityConstraint],
    eligibility_answers: dict[str, str],
    answered: dict[str, str],
) -> list[ClarificationQuestion]:
    by_id = {r.criterion_id: r for r in results}
    out = []
    for c in sorted(criteria, key=lambda c: -c.weight):
        r = by_id.get(c.id)
        if r and r.clarification_question:
            out.append(
                ClarificationQuestion(
                    id=f"Q-{c.id}",
                    criterion_id=c.id,
                    question=r.clarification_question,
                    why=f"{c.name} is {c.weight:g}% of this scorecard and your resume doesn't show it.",
                )
            )
        elif r and r.used_clarification:
            out.append(
                ClarificationQuestion(
                    id=f"Q-{c.id}",
                    criterion_id=c.id,
                    question=f"Experience with {c.name}",
                    answer=answered.get(c.id),
                )
            )
    for e in eligibility:
        out.append(
            ClarificationQuestion(
                id=f"Q-{e.id}",
                constraint_id=e.id,
                question=f"Can you meet this condition: “{e.text}”?",
                why="Resumes can't show this. It isn't scored; it only matters if you can't meet it.",
                answer=eligibility_answers.get(e.id),
            )
        )
    return out


def improvements(
    criteria: list[HiringCriterion], results: list[CriterionResult]
) -> list[Improvement]:
    by_id = {r.criterion_id: r for r in results}
    out = []
    for c in sorted(criteria, key=lambda c: -c.weight):
        r = by_id.get(c.id)
        if not r or r.gap_type == "none":
            continue
        summary = r.gaps[0] if r.gaps else r.reasoning[:160]
        out.append(
            Improvement(
                criterion_id=c.id,
                criterion_name=c.name,
                weight=c.weight,
                gap_type=r.gap_type,
                summary=summary,
                action=r.improvement,
                tailoring_can_fix=r.tailoring_can_fix,
            )
        )
    return out
