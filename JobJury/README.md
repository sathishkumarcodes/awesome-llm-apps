# JobJury

JobJury tells you how well your resume fits a specific job, explains why, and helps you tailor
the resume **without adding experience you don't have**.

Give it a resume (PDF or DOCX) and a job description. It:

1. builds a **hiring scorecard** for that job: the 8–12 criteria that matter for the role, weighted
   from the job description;
2. scores your resume against each criterion, quoting the resume lines it relied on;
3. shows separate **recruiter** and **hiring-manager** views, plus an **ATS readiness** score;
4. recommends **Apply**, **Apply — tailor first**, **Borderline**, **Probably skip** or
   **Needs clarification**, and explains why;
5. asks questions where your resume is silent, instead of assuming you lack the skill;
6. proposes tailored rewrites, fact-checks each one against your original resume, and exports the
   result as DOCX or PDF with a change report.

It runs on a local model through [Ollama](https://ollama.com) by default, so nothing leaves your
machine. You can switch to Claude or OpenAI models from the app's top bar.

> Scores are a structured, job-specific review of what your resume shows. They are not a claim
> about any employer's real hiring process, and not a probability of getting an interview.

---

## Contents

- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Installation](#installation)
- [Using the app](#using-the-app)
- [Choosing a model](#choosing-a-model)
- [Configuration](#configuration)
- [API](#api)
- [Project layout](#project-layout)
- [Testing and evaluation](#testing-and-evaluation)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Known limits](#known-limits)

---

## How it works

### Design principles

- **The model judges; code computes.** Language models read text and choose labels (a rubric
  level, a classification, a cited line). Every number — weights, scores, thresholds, the
  recommendation — is computed by deterministic code, so results are explainable and reproducible.
- **Every claim needs evidence.** A criterion only gets credit if the model cites a real line from
  your resume. Credit without a citation is removed.
- **Hard facts beat the model.** Degrees, years in a field, named skills, certifications and
  "all of X, Y, Z" lists are checked by rules. When the rules disagree with the model, the rules
  set a floor or a cap.
- **"Not shown" is not "missing".** If your resume doesn't mention something, it is marked *not
  demonstrated* and you are asked about it. Only your own "no" answer marks it as a confirmed gap.
- **Tailoring never invents.** Rewrites may reword, reorder and emphasise. New numbers, skills,
  titles, employers or certifications are flagged as unsupported and can't be accepted until you
  edit them.
- **Fair criteria only.** Criteria based on protected characteristics or their proxies are
  removed. Unknown work authorization never counts as ineligibility.

### The pipeline

```text
 resume (PDF/DOCX)                         job description (text or file)
        │                                              │
        ▼                                              ▼
 1. Resume parsing                              2. Job parsing
    text + line ids, sections,                     requirements (must-have / preferred),
    roles, dates, skills                           responsibilities, level, logistics
        │                                              │
        │                                              ▼
        │                                     3. Scorecard generation   (never sees the resume)
        │                                        draft → repair → rubrics → weights → validate
        │                                        saved and versioned per job
        │                                              │
        └──────────────────────┬───────────────────────┘
                               ▼
                    4. Requirement checks
                       hybrid search for relevant resume lines,
                       rule-based facts, one model call per requirement
                               │
                               ▼
                    5. Criterion evaluation
                       model picks a rubric level + classification with citations;
                       guardrails; recruiter and hiring-manager perspectives
                               │
                               ▼
                    6. Scores, hard-requirement gate, recommendation,
                       clarification questions, improvements
                               │
                               ▼
                    7. Tailoring (optional)
                       targeted rewrites → factuality check → your review → export
```

**1. Resume parsing.** The file is parsed with PyMuPDF or python-docx. Every line gets a stable
id (for example `L42`) so later steps can cite it. Sections, roles, dates and skills are found by
rules, then a model call fills in a structured profile. Every extracted fact must match text in the
resume, or it is dropped.

**2. Job parsing.** A model call extracts requirements, responsibilities, seniority and category,
with rule-based fallbacks for the title, level and category. Logistics such as travel, office days,
work authorization and driving licences are set aside as **eligibility constraints**. They are
never scored, only asked about.

**3. Scorecard generation.** From the job alone, the model groups requirements into 8–12 distinct
capabilities, each citing the requirements it covers. Code then repairs the draft: it drops
criteria without real requirement ids, removes protected-characteristic criteria, merges
overlaps, makes sure every explicit requirement is covered, and enforces labels. The model writes a
level 5–1 rubric for each criterion. Code computes the weights (summing to exactly 100). The
scorecard is saved and reused for every resume you check against that job. The model doesn't
produce the same scorecard twice, so saving it keeps comparisons fair. If no model is available, a
deterministic generator still produces a valid, plainer scorecard.

**4. Requirement checks.** For each requirement, the most relevant resume lines are found by
hybrid search: 75% embedding similarity (`all-MiniLM-L6-v2`, run locally) and 25% keyword
overlap. One model call per requirement returns a verdict with cited line ids. Rule-based fact
checks (degree level, years in an area, skill mentions, certifications) then raise or cap the
verdict.

**5. Criterion evaluation.** For each criterion, the model picks a rubric level and a
classification (*directly demonstrated*, *strong equivalent*, *transferable*, *weakly
demonstrated*, *not demonstrated*), citing resume lines. Guardrails enforce consistency with the
requirement checks. The **recruiter view** reads skills-list-only or 6+-year-old evidence one level
lower. The **hiring-manager view** stays within one level of the evidence.

**6. Scores and recommendation.**

```text
points(criterion) = weight × level / 5
score             = Σ points / Σ weight of assessed criteria × 100
```

The app reports overall fit, recruiter, hiring-manager, evidence completeness and ATS readiness.
A confirmed unmet hard requirement (licence, clearance, required certification), or a "no" to a
required condition, gives **Probably skip** whatever the score. If important criteria lack
evidence and answering would change the outcome, the result is **Needs clarification**. Otherwise,
fit bands decide, adjusted for recruiter visibility and how much is fixable by rewording.

Each weak criterion gets a gap type:

| Gap | Meaning | What helps |
|---|---|---|
| A. Qualification | The capability isn't shown | Rewording can't fix this |
| B. Evidence | You may have it; the resume doesn't say | Answer the question |
| C. Positioning | The evidence exists but is buried | A truthful rewrite |
| D. ATS | Formatting hides it | Fix the formatting |

**7. Tailoring.** The tailor gets the positioning gaps (with their evidence lines) as priorities,
the strengths to keep visible, and the genuine gaps it must not try to fill. Each proposed change
records which criteria it targets and is checked twice: by deterministic rules (new numbers,
skills, proper nouns, titles, certifications, scope inflation) and by a model fact-check against
the source lines. The worse of the two results wins.

| Result | Default decision |
|---|---|
| Supported | Accepted |
| Partially supported | Pending: you decide |
| Unsupported | Rejected: edit it before you can accept |

Export keeps the original file's formatting as far as possible (DOCX runs are edited in place; PDF
lines are re-typeset in the closest standard font) and includes a report of every change.

The full scorecard design (validation rules, weighting formula, rule registry, gate logic) is in
[docs/scorecard.md](docs/scorecard.md).

---

## Architecture

```text
┌──────────────────────────────┐        ┌──────────────────────────────────────────────┐
│ Frontend (Vite + React + TS) │  /api  │ Backend (FastAPI, Python 3.13)                │
│ localhost:5173               ├───────►│ 127.0.0.1:8000                                │
│ pages, scorecard view,       │ (proxy)│                                              │
│ model picker, polling        │        │  api/        HTTP routes                     │
└──────────────────────────────┘        │  services/   orchestration + background jobs │
                                        │  parsing/    resume + job parsing             │
                                        │  scoring/    requirement checks, evaluators   │
                                        │  scorecards/ generation, evaluation, scores   │
                                        │  rules/      rule registry + resume checks    │
                                        │  llm/        providers, prompts, validation   │
                                        │  export/     DOCX / PDF / report              │
                                        └───────┬──────────────────────┬───────────────┘
                                                │                      │
                                  ┌─────────────▼─────────┐  ┌─────────▼────────────────┐
                                  │ SQLite (backend/var/) │  │ LLM provider             │
                                  │ resumes, jobs,        │  │ Ollama (local, default)  │
                                  │ analyses, scorecards, │  │ Anthropic (Claude)       │
                                  │ evaluations, answers, │  │ OpenAI                   │
                                  │ resume versions       │  └──────────────────────────┘
                                  └───────────────────────┘
```

### Backend

- **FastAPI** serves the JSON API under `/api`. Long work (parsing, analysis, scorecard generation,
  tailoring, export) runs in a background thread pool. The API returns `202` with a record whose
  `status` moves `pending → running → complete | failed`, and the frontend polls it.
- **SQLAlchemy + SQLite** store everything in `backend/var/jobjury.db`. Uploaded files are in
  `backend/var/uploads/`, exports in `backend/var/exports/`. Tables are created on startup, and new
  tables are added automatically to an existing database. Jobs interrupted by a restart are marked
  failed and can be rerun from the UI.
- **LLM layer** (`app/llm/`):
  - `provider.py` has one interface with three implementations: Ollama, Anthropic and OpenAI. The
    active model is stored in `backend/var/llm_selection.json`. Each background job pins the model
    it started with, so switching models mid-run doesn't mix them.
  - `structured.py` runs versioned prompts from `app/llm/prompts/*.txt`, requests JSON matching a
    Pydantic schema (native structured outputs on Claude and OpenAI), validates the reply, retries
    with the validation error, and repairs common JSON defects.
  - `parallel.py` runs independent calls concurrently on hosted models (8 workers) and one at a
    time on a local model.
- **Embeddings** use `sentence-transformers/all-MiniLM-L6-v2`, run locally. The model downloads on
  first use and is warmed up at startup.

### Frontend

Vite + React 18 + TypeScript, with React Router and no UI framework. The dev server proxies `/api`
to the backend.

| Page | Purpose |
|---|---|
| Dashboard | Recent analyses and tailored versions |
| New analysis | Upload a resume, paste or upload a job, start the analysis |
| Analysis | Recommendation, scores, criteria table with drill-down, questions, improvements, tailoring, detailed evaluation |
| Library | Saved resumes and jobs; generate or regenerate a job's scorecard |
| Versions / Version | Review tailored changes, accept or reject them, export |

---

## Installation

### Requirements

| Tool | Version | Notes |
|---|---|---|
| Python | 3.13 | Managed by uv |
| [uv](https://docs.astral.sh/uv/) | recent | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node.js | 18 or newer | For the frontend |
| [Ollama](https://ollama.com/download) | recent | Optional if you only use hosted models |

About 8 GB of RAM is enough for `qwen3:4b`. The first analysis also downloads the embedding model
(about 90 MB).

### 1. Get the code and configure

```bash
git clone https://github.com/sathishkumarcodes/awesome-llm-apps.git
cd awesome-llm-apps/JobJury
cp .env.example .env        # edit to add API keys or change the default model
```

### 2. Start a local model (optional)

Skip this step if you'll only use Claude or OpenAI.

```bash
ollama serve &              # or open the Ollama app
ollama pull qwen3:4b        # default; fits an 8 GB Mac
ollama pull llama3.2:3b     # optional, smaller and faster
```

### 3. Start the backend

```bash
cd backend
uv sync                     # creates backend/.venv and installs dependencies
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Check it: `curl http://127.0.0.1:8000/api/health`.

### 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Open <http://localhost:5173>. To point the dev proxy at a backend elsewhere, set
`VITE_API_TARGET`, for example `VITE_API_TARGET=http://192.168.1.10:8000 npm run dev`.

For a production build of the frontend, run `npm run build`; the static files go to
`frontend/dist/`.

---

## Using the app

1. **Pick a model** in the top bar (see [Choosing a model](#choosing-a-model)).
2. **New analysis:** upload your resume (PDF or DOCX, up to 10 MB), paste the job description or
   upload it, then click **Analyze fit**. Resumes and jobs are saved, so next time you can pick them
   from the list.
3. **Wait for the analysis.** The page shows progress. An analysis makes 20–40 model calls. A small
   local model runs them one after another and can take 15–20 minutes; hosted models run them in
   parallel and are much faster. If a step fails, click **Rerun**.
4. **Read the result:**
   - The **recommendation** and the reasons behind it.
   - **Scores:** overall fit, recruiter, hiring manager, ATS readiness and evidence completeness.
     Scores are marked *provisional* when important criteria have no evidence yet.
   - The **criteria table.** Click a criterion to see why it matters, the job's wording, your
     resume lines as evidence, the rubric level, both perspectives, and what would help.
   - **Detailed evaluation** (collapsed) has the requirement-by-requirement view, the fixed-category
     recruiter and hiring-manager reports, seniority, and resume checks.
5. **Answer questions.** Where your resume is silent, the app asks: yes, no, or details. Answers
   are stored separately and only change the *with your answers* score. Saying **no** to a required
   condition (for example, required travel) makes it a blocker. Click **Re-evaluate with your
   answers** to apply them.
6. **Tailor.** Choose a mode:

   | Mode | What it changes |
   |---|---|
   | Minimal | At most one rewrite per role, for the two most relevant roles |
   | Recommended | Up to three rewrites per role, plus bullet and skills reordering |
   | Aggressive | Every bullet that can be made more relevant. More rewriting, never new facts |

   Each change shows the original, the rewrite, the criteria it targets, and its fact-check result.
   Accept, reject or edit each one.
7. **Export.** Once nothing is pending, export and download the tailored resume (same format as
   the original) and the change report.

If a job was parsed badly (wrong title or level, missing requirements), open the analysis and use
**Re-parse job**, then start a new analysis. To refresh a job's scorecard, use **Regenerate** in
the Library; this creates a new version and keeps the old one.

---

## Choosing a model

The model picker lists:

- **Local (Ollama):** every model you've pulled. Nothing leaves your machine.
- **Claude:** shown when `ANTHROPIC_API_KEY` is set.
- **OpenAI:** shown when `OPENAI_API_KEY` is set.

Restart the backend after adding a key. The choice is saved and used for new jobs. Jobs already
running keep the model they started with.

| | Local (e.g. `qwen3:4b`) | Hosted (Claude, OpenAI) |
|---|---|---|
| Privacy | Everything stays on your machine | Resume and job text go to the provider |
| Speed | Slow on a laptop; calls run one at a time | Calls run in parallel |
| Cost | Free | Billed per token by the provider |
| Judgment quality | Plausible but lenient and variable | Stronger |

Small local models tend to be generous. In our tests `qwen3:4b` agreed with hand labels on 78% of
requirement verdicts, and most of its errors were overclaims. For decisions you care about, use a
hosted model.

`CLOUD_EFFORT` (`low`, `medium` or `high`) sets reasoning effort on hosted models; `low` is the
fastest.

---

## Configuration

Settings come from environment variables or `.env` in the repository root. All are optional.

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | Default provider on first run (`ollama`, `anthropic`, `openai`). Later changes are made in the app. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_MODEL` | `qwen3:4b` | Default local model |
| `OLLAMA_THINK` | `false` | Let reasoning models think (slower) |
| `OLLAMA_TIMEOUT_SECONDS` | `300` | Per-call timeout for local models |
| `OLLAMA_NUM_CTX` | `8192` | Context window for local models |
| `OLLAMA_PARALLEL` | `1` | Concurrent local calls (raise only if Ollama is configured for it) |
| `ANTHROPIC_API_KEY` | — | Enables Claude models |
| `OPENAI_API_KEY` | — | Enables OpenAI models |
| `CLOUD_EFFORT` | `low` | Reasoning effort for hosted models |
| `CLOUD_TIMEOUT_SECONDS` | `120` | Per-call timeout for hosted models |
| `LLM_MAX_RETRIES` | `2` | Retries when a model returns invalid JSON |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Local embedding model for retrieval |
| `DATA_DIR` | `backend/var` | Database, uploads and exports |
| `DATABASE_URL` | SQLite in `DATA_DIR` | Any SQLAlchemy URL |
| `MAX_UPLOAD_MB` | `10` | Upload size limit |
| `RECRUITER_WEIGHTS`, `HIRING_MANAGER_WEIGHTS` | — | JSON overrides for the detailed evaluators' category weights |

---

## API

All routes are under `/api`. Interactive docs are at <http://127.0.0.1:8000/docs> while the
backend runs.

| Area | Routes |
|---|---|
| Health and models | `GET /health`, `GET /llm/models`, `PUT /llm/active` |
| Resumes | `POST /resumes` (upload), `GET /resumes`, `GET /resumes/{id}`, `GET /resumes/{id}/file` |
| Jobs | `POST /jobs` (text), `POST /jobs/upload`, `GET /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/reparse` |
| Analyses | `POST /matches`, `GET /matches`, `GET /matches/{id}`, `POST /matches/{id}/rerun`, `GET /matches/{id}/recruiter`, `GET /matches/{id}/hiring-manager`, `GET /matches/{id}/evaluation` |
| Scorecards | `POST /jobs/{id}/scorecard/generate`, `GET /jobs/{id}/scorecard`, `GET /scorecards/{id}`, `POST /scorecards/{id}/evaluate`, `GET /scorecards/{id}/evaluations/{eid}` |
| Evaluations | `GET /evaluations/{eid}`, `…/recruiter`, `…/hiring-manager`, `…/improvements`, `POST …/clarifications`, `POST …/reevaluate` |
| Tailoring | `POST /resumes/{id}/tailor`, `GET /resume-versions`, `GET /resume-versions/{id}`, `POST /resume-versions/{id}/rerun`, `PATCH /resume-versions/{id}/changes/{cid}`, `POST /resume-versions/{id}/validate` |
| Export | `POST /resume-versions/{id}/export`, `GET /resume-versions/{id}/download`, `GET /resume-versions/{id}/report` |
| Rules | `GET /rules` (the rule registry) |

---

## Project layout

```text
JobJury/
├── .env.example
├── docs/
│   └── scorecard.md            scorecard design, formulas and rules in depth
├── backend/
│   ├── pyproject.toml, uv.lock
│   ├── app/
│   │   ├── main.py             app factory, startup tasks
│   │   ├── api/                routes.py, scorecards.py
│   │   ├── core/               settings, errors, logging
│   │   ├── db/                 SQLAlchemy session
│   │   ├── models/             database tables
│   │   ├── schemas/            Pydantic models for documents, jobs, analyses, tailoring, API
│   │   ├── parsing/            PDF/DOCX parsing, sections, job parsing, profile building
│   │   ├── scoring/            requirement checks, fact rules, retrieval, evaluators, seniority
│   │   ├── scorecards/         generator, validator, weighting, evaluator, perspectives,
│   │   │                       scoring, recommendations, tailoring targets
│   │   ├── rules/              rule registry and deterministic resume diagnostics
│   │   ├── llm/                providers, structured calls, parallel runner, prompts/
│   │   ├── services/           resume, job, match, scorecard, tailoring, factuality, export, tasks
│   │   └── export/             DOCX and PDF writers, change report
│   ├── tests/                  pytest suite, fixtures, eval/ harness
│   └── var/                    runtime data (database, uploads, exports); not committed
└── frontend/
    ├── vite.config.ts          dev server and /api proxy
    └── src/
        ├── App.tsx, main.tsx   routes and layout
        ├── api.ts, types.ts    typed API client
        ├── hooks.ts            data loading and polling
        ├── components/         scorecard view, model picker, rerun, shared UI
        └── pages/              Dashboard, NewAnalysis, MatchPage, LibraryPage, Versions, Version
```

---

## Testing and evaluation

### Unit and pipeline tests

```bash
cd backend
uv run pytest                   # or .venv/bin/python -m pytest
```

The suite uses a scripted fake model (`tests/conftest.py`), so it needs no Ollama or API key. It
covers weighting, scorecard validation and repair, guardrails, scoring, the hard-requirement gate,
recommendations, resume diagnostics, the rule registry, tailoring truthfulness and the full
pipeline with storage.

Code quality:

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy app
cd ../frontend && npm run typecheck
```

### Measuring model quality

These scripts call a real model, so hosted runs cost money.

```bash
cd backend
# Requirement verdicts against hand-labeled cases
.venv/bin/python -m tests.eval.run_eval --provider ollama --model qwen3:4b
.venv/bin/python -m tests.eval.run_eval --provider anthropic --model claude-haiku-5-5

# Model-generated scorecards for 8 role types (criteria count, coverage, weights, validity)
.venv/bin/python -m tests.eval.scorecard_check

# Turn one of your own analyses into a labeling file, then label it and add it to the eval
.venv/bin/python -m tests.eval.make_case <match_id>
```

Results are written to `tests/eval/results/` (ignored by git). Put cases built from your own resume
in `tests/eval/cases/local/`, which is also ignored.

---

## Privacy

- With a local model, resumes, jobs and results never leave your machine.
- With Claude or OpenAI selected, resume and job text are sent to that provider for each model
  call. The app shows a notice when a hosted model is selected.
- Logs record prompt names, error types and timings, never resume content.
- All data lives in `backend/var/`. Delete that folder to remove everything.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not reach Ollama" | Start Ollama (`ollama serve` or the app) and check `OLLAMA_BASE_URL`. |
| Model not in the picker | Run `ollama pull <model>`; for hosted models, set the API key in `.env` and restart the backend. |
| Analysis is very slow | Expected on small local models (15–20 minutes). Use a hosted model, or a smaller local model such as `llama3.2:3b`. |
| Local model times out | Raise `OLLAMA_TIMEOUT_SECONDS`, or use a smaller model. |
| "Invalid structured output" | The model couldn't produce valid JSON after retries. Click **Rerun**, or switch to a larger model. |
| A job shows as failed after a restart | Jobs running during a restart are marked failed. Click **Rerun**. |
| Wrong job title, level or requirements | Use **Re-parse job**, then start a new analysis. |
| Frontend shows network errors | Check the backend is on port 8000, or set `VITE_API_TARGET`. |

---

## Known limits

- Small local models are lenient: they tend to credit adjacent experience as a match. Treat local
  results as a first pass.
- Scorecards generated by a model vary between runs. That's why each job's scorecard is saved and
  reused; regenerating creates a new version.
- *Inferred* criteria come from the model reading the responsibilities. They are labeled, capped at
  15% of the weight, and never treated as hard requirements.
- Judgments are based on resume text only. Work the resume doesn't describe can't be seen, which is
  why the app asks questions instead of assuming.
- PDF export re-typesets changed lines in a standard font, so unusual fonts may not match exactly.
  DOCX export preserves formatting more closely.
