from app.rules.engine import ats_readiness, run_diagnostics
from app.schemas.document import DocLine, ResumeDocument
from app.schemas.profile import CandidateProfile


def test_sample_resume_diagnostics(sample_doc):
    doc, profile = sample_doc
    out = {o.rule_id: o for o in run_diagnostics(doc, profile, None)}
    assert out["ATS-01"].status == "pass"
    assert out["ATS-02"].status == "pass"
    assert out["ATS-03"].status == "pass"
    assert out["ATS-04"].status == "pass"
    assert out["IMP-01"].status in ("pass", "warn")
    score = ats_readiness(list(out.values()))
    assert 70 <= score <= 100


def test_writing_rules_flag_weak_bullets():
    lines = [DocLine(id=f"L{i}", text=t, kind="bullet", section="experience") for i, t in enumerate([
        "I was responsible for the roadmap.", "Helped with stuff.", "Worked on various projects for my team.",
    ])]  # fmt: skip
    doc = ResumeDocument(filename="x.docx", file_type="docx", lines=lines, text="\n".join(ln.text for ln in lines))  # fmt: skip
    out = {o.rule_id: o for o in run_diagnostics(doc, CandidateProfile(), None)}
    assert out["WRT-03"].status == "warn"
    assert out["WRT-04"].status == "warn"
    assert out["WRT-02"].status in ("warn", "fail")
    assert out["ATS-02"].status == "fail"
