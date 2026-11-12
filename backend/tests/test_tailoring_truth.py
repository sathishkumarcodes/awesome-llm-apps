"""Truth-preserving tailoring: rewrites can't add facts; scorecard targets are traced."""

from app.services import factuality
from app.services.tailoring_service import Tailor
from tests.conftest import FIXTURES, parse_job_without_llm

SRC = "Managed product roadmap for the payment integrity audit platform used by 40 health plan clients."
RESUME = SRC + " Skills: SQL, Python, AWS."


def check(proposed):
    return factuality.validate(proposed, SRC, [SRC], RESUME, use_llm=False)


def test_accurate_rewrite_is_supported_by_rules():
    r = check(
        "Owned the roadmap for a payment integrity audit platform serving 40 health plan clients."
    )
    assert r.deterministic_status in ("SUPPORTED", "PARTIALLY_SUPPORTED")
    assert not any(i.hard for i in r.issues)


def test_new_number_is_unsupported():
    r = check("Managed the roadmap for an audit platform used by 400 health plan clients.")
    assert r.status == "UNSUPPORTED" and any(i.kind == "new_number" for i in r.issues)


def test_new_skill_is_flagged():
    r = check(
        "Managed the payment integrity platform roadmap using Kubernetes for 40 health plan clients."
    )
    assert any(i.kind in ("new_skill", "new_term", "new_proper_noun") for i in r.issues)
    assert r.status != "SUPPORTED"


def test_unsupported_changes_start_rejected():
    from app.services.tailoring_service import initial_decision

    assert initial_decision("UNSUPPORTED") == "rejected"
    assert initial_decision("PARTIALLY_SUPPORTED") == "pending"


def test_tailoring_targets_scorecard_criteria_and_keeps_evidence_valid(fake_llm, sample_doc):
    from app.scorecards.generator import generate
    from app.scorecards.tailoring import TailoringTargets
    from app.services.scorecard_service import build_evaluation

    doc, profile = sample_doc
    job = parse_job_without_llm((FIXTURES / "sample_job.txt").read_text())
    card = generate(job, use_model=False)
    roadmap = next(
        c for c in card.criteria if any("roadmap" in t.lower() for t in c.source_requirement_texts)
    )

    def handler(system, user, schema):
        if "ONE hiring criterion" in system:
            if roadmap.name in user:  # evidence buried: positioning gap
                return {"classification": "strong_equivalent", "level": "4", "hiring_manager_level": "4",
                        "evidence": [{"line_id": "L0008", "strength": "strong"}], "gap_type": "positioning"}  # fmt: skip
            return {"classification": "not_demonstrated", "level": "0", "gap_type": "evidence"}
        if "tailor resume text" in system and "ROLE BULLETS" in user and "L0008" in user:
            return {
                "rewrites": [
                    {
                        "line_id": "L0008",
                        "new_text": "Owned the product roadmap for the payment integrity audit platform used by 40 health plan clients.",
                        "reason": "surface roadmap ownership",
                        "supporting_line_ids": ["L0008"],
                    }
                ]
            }
        if "ONE job requirement" in system:
            return {
                "status": "not_demonstrated",
                "support": "not_demonstrated",
                "rationale": "x",
                "evidence": [],
            }
        return None

    fake_llm.handler = handler
    ev = build_evaluation(card, doc, profile, job)
    targets = TailoringTargets.build(card, ev)
    assert [t.criterion_id for t in targets.positioning] == [roadmap.id]
    assert roadmap.name not in targets.real_gaps

    changes = Tailor(doc, job, "", None, "minimal", targets).run()
    rewrite = next(c for c in changes if c.target_line_ids == ["L0008"])
    assert rewrite.target_criterion_ids == [roadmap.id]
    assert all(lid in doc.line_map() for c in changes for lid in c.supporting_line_ids)
    assert "requires_user_review" in rewrite.model_dump()
