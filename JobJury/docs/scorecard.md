# Dynamic hiring scorecard

For each job, JobJury builds a focused scorecard of 8–12 hiring criteria from the job description, then evaluates a resume against it with cited evidence, separate recruiter and hiring-manager views, deterministic scores, and a recommendation. It is a structured, job-specific review, not a claim about the employer's real process, and scores are not interview probabilities.

> The rules determine how to evaluate. The job description determines what matters. The candidate's evidence determines the assessment.

## Pipeline

```text
job description ─► job parsing (requirements, logistics, level)
                     │
                     ▼
            scorecard generation   (job only; never sees a resume)
              draft ─► repair ─► rubrics ─► weights ─► validation ─► saved, versioned
                     │
resume ─────────────►├─► per-requirement checks (hybrid search + facts + model)
                     ├─► per-criterion evaluation (model picks a rubric level, cites lines)
                     ├─► guardrails + recruiter / hiring-manager perspectives
                     ├─► deterministic scores, hard-requirement gate, recommendation
                     └─► clarification questions, improvements, tailoring targets
```

An analysis (`POST /api/matches`) runs this whole pipeline. The scorecard is created, or the saved one reused, **before** the resume is read. The original analysis (requirement checks, fixed-category recruiter/HM evaluators, seniority) is kept and shown under **Detailed evaluation**.

## Code map

| Area | Files |
|---|---|
| Schemas | `backend/app/scorecards/schemas.py` |
| Generation | `scorecards/generator.py`, prompts `scorecard_generation_v1`, `criterion_rubric_v1` |
| Validation & repair | `scorecards/validator.py` |
| Weights | `scorecards/weighting.py` |
| Evaluation | `scorecards/evaluator.py`, `scorecards/perspectives.py`, prompt `criterion_evaluation_v1` |
| Scores | `scorecards/scoring.py` |
| Recommendation, gate, questions, improvements | `scorecards/recommendations.py` |
| Tailoring targets | `scorecards/tailoring.py` (used by `services/tailoring_service.py`) |
| Rule registry & resume diagnostics | `app/rules/registry.py`, `app/rules/engine.py` |
| Storage & orchestration | `services/scorecard_service.py`; tables `scorecards`, `scorecard_evaluations`, `clarifications` |
| API | `app/api/scorecards.py` |
| UI | `frontend/src/components/scorecard.tsx`, `pages/MatchPage.tsx` |

## Scorecard generation

1. **Requirement pool:** explicit must-haves, preferred items and responsibilities, plus inferred signals (`S1`, `S2`, …). Logistics (travel, office days, work authorization, licences to drive…) become **eligibility constraints**, which are never scored.
2. **Draft:** the model groups requirements into distinct capabilities and cites requirement ids for each.
3. **Repair** (deterministic):
   - drop criteria without real requirement ids
   - remove any criterion relying on protected characteristics or their proxies
   - merge overlapping criteria
   - attach or add criteria so every explicit requirement is covered
   - cap the total at 12, and split broad criteria up to 8 when the job has enough requirements (never padding vague jobs)
   - enforce labels: inferred-only criteria are at most medium and never hard; must-have criteria at least high; preferred-only at most medium
4. **Rubrics:** the model writes level 5–1 anchors and recruiter / hiring-manager guidance for each criterion. Level 0 ("confirmed gap") and "unknown" are fixed text.
5. **Weights** (deterministic, `weighting.py`): the base comes from importance (critical 10, high 7, medium 4, low 2). It is multiplied by the strongest requirement behind the criterion (must-have 1.0, responsibility 0.85, preferred 0.6, inferred 0.5) and by breadth. Preferred-only criteria are capped at 25% in total, inferred-only at 15%, and any single criterion at 25%. The result is rounded to 0.1 and sums to exactly 100.
6. **Final validation:** every criterion has a rubric and mapped rules, weights sum to 100, and generation was independent of any resume.

Without a usable model, a deterministic generator groups requirements by category, so a valid (plainer) scorecard is always produced.

**Hard requirements** are explicit must-haves of a non-negotiable kind: licence, clearance, or a required/active certification. Degrees with "or equivalent", missing keywords and inferred signals are never hard.

## Evaluation

For each criterion, the evaluator:
- collects the per-requirement verdicts for its source requirements, plus a hybrid search on the criterion itself
- has the model choose a **rubric level** and a classification, citing resume line ids

The model never writes numbers. Guardrails then apply:

| Rule | Effect |
|---|---|
| REQ-01 | Credit requires a real, cited resume line (ids named in the reasoning count if the line was shown). |
| Consistency | Can't be "not demonstrated" if a source requirement is plainly shown; can't be "direct" if none is. |
| Level ↔ classification | Levels must fit the classification (e.g. transferable is 3 or 2). |
| Confirmed absent | Only from the candidate's own "no" answer. A resume that doesn't show something is **not demonstrated**, not a confirmed gap. |
| REC-02 / REC-03 | A recruiter reads skills-list-only or 6+-year-old evidence one level lower. |
| HM-02 | The hiring-manager level stays within one step of the evidence level. |
| ADV-03 | Gaps are classified as qualification, evidence, positioning or ATS. |

### Classifications and levels

| Classification | Levels | Meaning |
|---|---|---|
| Directly demonstrated | 5, 4 | The resume plainly shows it |
| Strong equivalent | 4, 3 | Equivalent experience in other words |
| Transferable | 3, 2 | Adjacent experience |
| Weakly demonstrated | 2, 1 | Mentioned, little depth |
| Not demonstrated | 0 points | The resume doesn't establish it; triggers a question |
| Confirmed absent | 0 | The candidate said no |
| Unknown | excluded | Can't be judged from a resume (non-explicit criteria only) |

## Scores (`scoring.py`)

```text
points(criterion) = weight × level / 5          unknown criteria are excluded
score             = Σ points / Σ weight(assessed) × 100
```

- **Overall fit:** every criterion once, at its evidence level.
- **Recruiter:** criteria owned by `recruiter` or `both`, at the recruiter level.
- **Hiring manager:** criteria owned by `hiring_manager` or `both`, at the hiring-manager level.
- **Evidence completeness:** the share of weight with any resume evidence.
- **Provisional:** critical/high criteria without evidence carry 20% or more of the weight.
- **ATS readiness:** computed separately from the ATS-xx and KEY-01 rules.
- **Fit with your answers:** shown only when clarifications exist. Resume-based scores never use answers.

Scores are reproducible from the stored per-criterion results and `scoring_config` (a test checks this).

## Recommendation (`recommendations.py`)

1. **ADV-01 gate:** a confirmed unmet hard requirement, or a "no" to a required condition, gives PROBABLY SKIP, whatever the score. The blocker quotes the job text and the candidate's answer.
2. **ADV-02:** if critical/high criteria lack evidence (15% or more of the weight) and assuming level 4 on them would change the decision, the result is NEEDS CLARIFICATION.
3. Otherwise, fit bands (75 / 60 / 45) are adjusted for:
   - recruiter visibility (recruiter score below 70 means tailor first)
   - positioning potential (8% or more of the weight fixable by rewording)
   - weak critical criteria (two or more qualification gaps cap the result at BORDERLINE)

## Improvements and tailoring

Each low criterion gets a gap type:
- **A. Qualification:** the capability itself isn't shown. Rewording can't fix this.
- **B. Evidence:** the candidate may have it. Ask.
- **C. Positioning:** the evidence exists but is buried. A truthful rewrite can fix this.
- **D. ATS:** formatting hides it.

Tailoring receives the positioning criteria (with their evidence lines) as priorities, the strengths to keep visible, and the genuine gaps it must **not** try to fill. Every change records `target_criterion_ids` and `requires_user_review`, and still passes the TR-xx factuality checks.

## Rule registry

`app/rules/registry.py` lists every rule with a stable id, the code that implements it, and what it feeds (job fit, ATS readiness, resume quality, recommendation, tailoring safety, evidence). The families are REQ, KEY, SEN, REC, HM, IMP, ATS, WRT, ADV and TR. `GET /api/rules` returns the list, and a test checks that every `implemented_in` target exists. Diagnostic rules (ATS, WRT, IMP, KEY) describe the resume and feed ATS readiness and advice, never job fit, so no fact is counted twice.

## API

| Method | Path | |
|---|---|---|
| POST | `/api/jobs/{job_id}/scorecard/generate` | New scorecard version (background) |
| GET | `/api/jobs/{job_id}/scorecard` | Latest scorecard |
| GET | `/api/scorecards/{id}` | One scorecard version |
| POST | `/api/scorecards/{id}/evaluate` | Evaluate a resume `{resume_id}` (background) |
| GET | `/api/scorecards/{id}/evaluations/{eid}` | Evaluation |
| GET | `/api/evaluations/{eid}` · `/recruiter` · `/hiring-manager` · `/improvements` | Views |
| POST | `/api/evaluations/{eid}/clarifications` | Answer `{question_id, kind: yes\|no\|detail, answer}` |
| POST | `/api/evaluations/{eid}/reevaluate` | Re-run with the answers (new evaluation) |
| GET | `/api/matches/{id}/evaluation` | Newest evaluation for an analysis |

## Testing

```bash
cd backend
.venv/bin/python -m pytest                               # unit + pipeline tests (no model needed)
.venv/bin/python -m tests.eval.scorecard_check           # model-generated scorecards for 8 role types
.venv/bin/python -m tests.eval.run_eval                  # requirement verdicts vs hand labels
.venv/bin/python -m tests.eval.make_case <match_id>      # turn your own analysis into a labeled case
```

The pytest suite uses a scripted fake model (`tests/conftest.py`), so it checks the guardrails, scoring, gate, validation and storage deterministically. Model quality is measured with the eval scripts.

## Known limits

- Small local models (e.g. `qwen3:4b`) produce plausible but noisier scorecards and judgments, and they're slow. An analysis makes roughly 20–40 model calls. Hosted models run them in parallel.
- "Inferred" criteria come from the model reading the responsibilities. They are labeled, capped, and never hard.
- Criterion levels are judgments from resume text. They can't see work the resume doesn't describe, which is why the app asks questions instead of assuming.
