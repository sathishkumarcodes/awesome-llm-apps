"""End-to-end scorecard flow with a scripted model and a real (temporary) database."""

from app.scorecards.generator import generate
from app.scorecards.schemas import EvaluationContent
from app.scorecards.scoring import compute
from app.services.scorecard_service import build_evaluation
from tests.conftest import FIXTURES, parse_job_without_llm


def evidence_handler(system, user, schema):
    """Credit any criterion whose candidate lines include the payment-integrity bullet."""
    if "ONE hiring criterion" in system:
        if "L0008" in user:
            return {"classification": "directly_demonstrated", "level": "5", "hiring_manager_level": "4",
                    "evidence": [{"line_id": "L0008", "strength": "strong"}], "gap_type": "none"}  # fmt: skip
        return {"classification": "not_demonstrated", "level": "0", "gap_type": "evidence",
                "clarification_question": "Have you done this?"}  # fmt: skip
    return None


def test_full_evaluation_and_reproducible_scores(fake_llm, sample_doc):
    fake_llm.handler = evidence_handler
    doc, profile = sample_doc
    job = parse_job_without_llm((FIXTURES / "sample_job.txt").read_text())
    card = generate(job, use_model=False)
    ev = build_evaluation(card, doc, profile, job)
    assert {r.criterion_id for r in ev.results} == {c.id for c in card.criteria}
    for r in ev.results:
        for e in r.evidence:
            assert e.source == "clarification" or e.original_text == doc.line_map()[e.line_id].text
    # Stored structured results reproduce the scores exactly.
    stored = EvaluationContent.model_validate(ev.model_dump(mode="json"))
    assert compute(card.criteria, stored.results, stored.scores.ats_readiness) == stored.scores
    assert ev.recommendation.decision in (
        "APPLY",
        "APPLY_TAILOR_FIRST",
        "BORDERLINE",
        "PROBABLY_SKIP",
        "NEEDS_CLARIFICATION",
    )
    assert ev.scoring_config["scoring"]["version"]


def test_saved_scorecard_is_reused_and_clarifications_flow(fake_llm, monkeypatch):
    from app.db.session import SessionLocal, init_db
    from app.models import Resume
    from app.services import job_service, resume_service, scorecard_service

    fake_llm.handler = evidence_handler
    init_db()
    db = SessionLocal()
    data = (FIXTURES / "sample_resume.docx").read_bytes()
    monkeypatch.setattr(resume_service, "enrich_profile", lambda d, p: p)
    resume = resume_service.ingest_resume(db, "sample_resume.docx", data)
    monkeypatch.setattr(
        job_service,
        "call_structured",
        lambda *a, **k: (_ for _ in ()).throw(
            __import__("app.core.errors", fromlist=["AppError"]).AppError("no model")
        ),
    )
    job = job_service.create_job(db, (FIXTURES / "sample_job.txt").read_text())

    sc1 = scorecard_service.ensure_scorecard(db, job)
    sc2 = scorecard_service.ensure_scorecard(db, job)
    assert sc1.id == sc2.id and sc1.version == 1, "the saved scorecard is reused"

    ev = scorecard_service.evaluate_now(db, sc1, db.get(Resume, resume.id))
    content = EvaluationContent.model_validate(ev.content)
    q = next(q for q in content.clarifications if q.criterion_id)
    scorecard_service.answer(db, ev.id, q.id, "no", "No")
    ev2 = scorecard_service.evaluate_now(db, sc1, db.get(Resume, resume.id))
    c2 = EvaluationContent.model_validate(ev2.content)
    r = next(r for r in c2.results if r.criterion_id == q.criterion_id)
    assert r.classification == "confirmed_absent", "a 'no' answer confirms the gap"
    other = next(r for r in c2.results if r.criterion_id != q.criterion_id)
    assert other.classification != "confirmed_absent"

    sc3 = scorecard_service.request_generation(db, job.id)
    assert sc3.version == 2
    db.close()
