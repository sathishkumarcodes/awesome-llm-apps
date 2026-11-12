import { Fragment, useState } from "react";
import { api } from "../api";
import { Card, Empty, IconChevronRight, Metric, Section, Spinner, Status, DECISION_TONE, sentenceCase, type Tone } from "./ui";
import type {
  Classification,
  CriterionResult,
  EvaluationOut,
  GapType,
  HiringCriterion,
  Level,
  RuleOutcome,
} from "../types";

/* --------------------------------------------------------------------------
   Labels
   -------------------------------------------------------------------------- */

export const CLASS_LABEL: Record<Classification, [string, Tone]> = {
  directly_demonstrated: ["Strong", "good"],
  strong_equivalent: ["Strong equivalent", "good"],
  transferable: ["Transferable", "warn"],
  weakly_demonstrated: ["Weak", "warn"],
  not_demonstrated: ["Not shown", "open"],
  confirmed_absent: ["Confirmed gap", "bad"],
  unknown: ["Can't tell from resume", "neutral"],
};

const GAP_KIND: Record<GapType, string> = {
  none: "",
  positioning: "Rewording can help",
  ats: "Formatting",
  evidence: "Needs your input",
  qualification: "Genuine gap",
};

const GAP_EXPLAIN: Record<GapType, string> = {
  none: "",
  qualification: "The capability itself isn't shown. Rewording won't fix this.",
  evidence: "You may have this experience, but the resume doesn't say so. Answer the related question.",
  positioning: "The evidence is there but easy to miss. A truthful rewrite can make it visible.",
  ats: "The content exists, but its formatting makes it hard for screening software to read.",
};

/** Fixable-now first, then input from you, then genuine gaps. */
const GAP_PRIORITY: Record<GapType, number> = { positioning: 0, ats: 1, evidence: 2, qualification: 3, none: 9 };

const OWNER_LABEL = { recruiter: "recruiter", hiring_manager: "hiring manager", both: "recruiter and hiring manager" } as const;

function levelNum(l: Level | null | undefined): number | null {
  return l == null || l === "unknown" ? null : Number(l);
}

function levelText(l: Level | null) {
  return l == null ? "—" : l === "unknown" ? "can't tell" : `${l}/5`;
}

/* --------------------------------------------------------------------------
   1. Recommendation and key figures
   -------------------------------------------------------------------------- */

export function AnalysisSummary({ ev }: { ev: EvaluationOut }) {
  const content = ev.content!;
  const card = ev.scorecard.content!;
  const s = content.scores;
  const rec = content.recommendation;
  // Blockers get their own callout below, so drop reasons that only restate them.
  const why = rec.why.filter(
    (w) => !content.blockers.some((b) => w === b.explanation || (b.requirement_text && w.includes(b.requirement_text))),
  );

  return (
    <div className="panel">
      <div className="summary">
        <div>
          <div className="decision-label">Recommendation</div>
          <div className="decision-value">
            <span className={`dot dot-${DECISION_TONE[rec.decision]}`} aria-hidden />
            {sentenceCase(rec.label)}
          </div>
          <p className="decision-headline">{rec.headline}</p>
          {why.length > 0 && (
            <ul className="why">{why.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
          {content.blockers.map((b, i) => (
            <div key={i} className="callout callout-error mt-3">
              <div className="callout-title">{b.explanation}</div>
              <div>Job requirement: “{b.requirement_text}”</div>
              <div className="muted">Your information: {b.candidate_evidence}</div>
            </div>
          ))}
        </div>
        <div className="metrics">
          <Metric value={s.overall_fit} label="Overall fit" hint="Weighted across every criterion in the scorecard" />
          <Metric
            value={s.evidence_completeness}
            suffix="%"
            label="Criteria with resume evidence"
            hint="Share of the scorecard's weight that has at least one supporting resume line"
          />
          <Metric value={s.ats_readiness} label="ATS readiness" hint="How easily screening software can read the resume" />
        </div>
      </div>
      <div className="summary-foot">
        {s.provisional && (
          <span>
            <strong>Provisional.</strong> Important criteria have no evidence in the resume yet, so these scores may
            change once you answer the questions below.
          </span>
        )}
        {s.fit_with_clarifications != null && (
          <span>
            Including your answers, overall fit would be <strong>{Math.round(s.fit_with_clarifications)}</strong>. The
            scores above use only the resume, because that's all a recruiter sees.
          </span>
        )}
        <span className="faint xs">
          Scored on {card.criteria.length} criteria from the job description
          {card.generated_by === "deterministic" ? " (grouped without AI, so criteria are broader)" : ""} · scorecard v
          {ev.scorecard.version}
          {ev.model_name && ` · ${ev.model_name}`}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   2. Recruiter and hiring-manager assessments
   -------------------------------------------------------------------------- */

export function Perspectives({ ev }: { ev: EvaluationOut }) {
  const s = ev.content!.scores;
  return (
    <Section
      title="Recruiter and hiring manager"
      description="The same evidence, read two ways. A recruiter screens for visible matches; a hiring manager looks for depth."
    >
      <div className="grid-2 align-start">
        <PerspectivePanel ev={ev} owner="recruiter" score={s.recruiter} title="Recruiter screen" question="Would this resume get through a first screen?" />
        <PerspectivePanel ev={ev} owner="hiring_manager" score={s.hiring_manager} title="Hiring manager" question="Does the experience show this person can do the job?" />
      </div>
    </Section>
  );
}

function PerspectivePanel({ ev, owner, score, title, question }: {
  ev: EvaluationOut;
  owner: "recruiter" | "hiring_manager";
  score: number | null;
  title: string;
  question: string;
}) {
  const card = ev.scorecard.content!;
  const results = new Map(ev.content!.results.map((r) => [r.criterion_id, r]));
  const rows = card.criteria
    .filter((c) => c.evaluation_owner === owner || c.evaluation_owner === "both")
    .map((c) => {
      const r = results.get(c.id);
      const level = r ? (owner === "recruiter" ? r.recruiter_level : r.hiring_manager_level) : null;
      const note = r ? (owner === "recruiter" ? r.recruiter_note : r.hiring_manager_note) : "";
      return { c, r, n: levelNum(level), note };
    })
    .sort((a, b) => b.c.weight - a.c.weight);
  const strong = rows.filter((x) => x.n != null && x.n >= 4).slice(0, 3);
  const concerns = rows
    .filter((x) => x.r && ((x.n != null && x.n <= 2) || x.r.classification === "not_demonstrated"))
    .slice(0, 3);

  return (
    <div className="panel perspective">
      <h3>
        <span>{title}</span>
        <span className="score">
          {score == null ? "—" : Math.round(score)}
          {score != null && <small>/100</small>}
        </span>
      </h3>
      <p className="perspective-q">{question}</p>
      <dl>
        <div>
          <dt>Reads well</dt>
          <dd>{strong.length ? strong.map((x) => x.c.name).join(", ") : <span className="muted">Nothing reads as a clear strength yet.</span>}</dd>
        </div>
        <div>
          <dt>Likely concerns</dt>
          <dd>
            {concerns.length ? (
              <ul>
                {concerns.map((x) => (
                  <li key={x.c.id}>
                    {x.c.name}
                    <span className="muted"> — {x.note || CLASS_LABEL[x.r!.classification][0].toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted">No major concerns on the criteria this view covers.</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* --------------------------------------------------------------------------
   3–4. Scorecard with evidence
   -------------------------------------------------------------------------- */

export function ScorecardTable({ ev }: { ev: EvaluationOut }) {
  const card = ev.scorecard.content!;
  const results = new Map(ev.content!.results.map((r) => [r.criterion_id, r]));
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Section
      title="Hiring scorecard"
      description={card.summary || "What this job needs, weighted by importance. Select a criterion to see the job's wording and the resume lines behind the assessment."}
    >
      {card.summary && (
        <p className="small muted">Select a criterion to see the job's wording and the resume lines behind the assessment.</p>
      )}
      <div className="list sc" role="table" aria-label="Hiring scorecard">
        <div className="list-head" role="row">
          <span role="columnheader">Criterion</span>
          <span role="columnheader" className="right">Weight</span>
          <span role="columnheader">Assessment</span>
          <span role="columnheader">Evidence</span>
          <span role="columnheader" />
        </div>
        {card.criteria.map((c) => {
          const r = results.get(c.id);
          const isOpen = open === c.id;
          return (
            <Fragment key={c.id}>
              <button className="sc-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)}>
                <span className="sc-name">
                  {c.name}
                  {c.is_hard_requirement && <span className="tag">Required</span>}
                  {!c.is_explicit && <span className="tag" title="Inferred from the responsibilities, not stated as a requirement">Inferred</span>}
                </span>
                <span className="sc-weight cell-num muted">{c.weight}%</span>
                <span className="sc-assess small">
                  {r ? (
                    <>
                      <Status tone={CLASS_LABEL[r.classification][1]}>{CLASS_LABEL[r.classification][0]}</Status>
                      {levelNum(r.level) != null && r.classification !== "not_demonstrated" && <span className="sc-level">{r.level}/5</span>}
                    </>
                  ) : (
                    <span className="faint">Not evaluated</span>
                  )}
                </span>
                <span className="sc-evidence small">{r ? <EvidenceStatus r={r} /> : null}</span>
                <span className="sc-chevron" aria-hidden><IconChevronRight /></span>
              </button>
              {isOpen && r && <CriterionDetail c={c} r={r} />}
            </Fragment>
          );
        })}
      </div>
    </Section>
  );
}

function EvidenceStatus({ r }: { r: CriterionResult }) {
  const lines = r.evidence.filter((e) => e.source === "resume").length;
  const answered = r.evidence.some((e) => e.source === "clarification");
  if (lines) return <span>{lines} resume line{lines > 1 ? "s" : ""}{answered ? " + answer" : ""}</span>;
  if (answered) return <span>Your answer only</span>;
  return <span className="faint">None in resume</span>;
}

function CriterionDetail({ c, r }: { c: HiringCriterion; r: CriterionResult }) {
  const n = levelNum(r.level);
  const points = n == null ? null : Math.round(c.weight * n * 2) / 10;
  const anchor = r.level === "unknown" ? c.rubric.unknown : (c.rubric as unknown as Record<string, string>)[`level_${r.level}`];
  const resumeEv = r.evidence.filter((e) => e.source === "resume");
  const answerEv = r.evidence.filter((e) => e.source === "clarification");

  return (
    <div className="sc-detail">
      <div className="grid-2 align-start">
        <div>
          <h4>From the job description</h4>
          <div className="sc-quotes">
            {c.source_requirement_texts.map((t, i) => <blockquote key={i}>{t}</blockquote>)}
          </div>
          <p className="sc-meta">
            {c.importance[0].toUpperCase() + c.importance.slice(1)} importance · judged by the {OWNER_LABEL[c.evaluation_owner]}
            {!c.is_explicit && " · inferred, not stated as a requirement"}
          </p>
        </div>
        <div>
          <h4>Evidence in your resume</h4>
          <div className="sc-quotes">
            {resumeEv.map((e) => (
              <div key={e.line_id}>
                <blockquote>{e.original_text}</blockquote>
                <div className="quote-meta">{e.source_location || e.source_section} · {e.evidence_strength} evidence</div>
              </div>
            ))}
            {answerEv.map((e) => (
              <div key={e.line_id}>
                <blockquote className="from-you">{e.original_text}</blockquote>
                <div className="quote-meta">Your answer, not on the resume</div>
              </div>
            ))}
            {!resumeEv.length && !answerEv.length && (
              <p className="small muted">No resume line shows this. That doesn't mean you lack it, only that the resume doesn't say.</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4>Why this assessment</h4>
        <p className="small">
          <strong>{CLASS_LABEL[r.classification][0]}</strong>
          {n != null && r.classification !== "not_demonstrated" && <> · level {r.level} of 5</>}
          {points != null && <span className="muted"> · {points} of {c.weight} points</span>}
          {r.clarified_level != null && <span className="muted"> · with your answer: {levelText(r.clarified_level)}</span>}
        </p>
        {r.reasoning && <p className="small mt-1">{r.reasoning}</p>}
        {anchor && <p className="small muted mt-1">Rubric for this level: {anchor}</p>}
        {r.gaps.length > 0 && <p className="small mt-1"><span className="muted">Not shown:</span> {r.gaps.join("; ")}</p>}
      </div>

      {(r.recruiter_level != null || r.hiring_manager_level != null) && (
        <div className="grid-2 align-start">
          {r.recruiter_level != null && (
            <div>
              <h4>Recruiter · {levelText(r.recruiter_level)}</h4>
              <p className="small">{r.recruiter_note || c.recruiter_guidance || "—"}</p>
            </div>
          )}
          {r.hiring_manager_level != null && (
            <div>
              <h4>Hiring manager · {levelText(r.hiring_manager_level)}</h4>
              <p className="small">{r.hiring_manager_note || c.hiring_manager_guidance || "—"}</p>
            </div>
          )}
        </div>
      )}

      {r.gap_type !== "none" && r.improvement && (
        <div className="sc-improve">
          <h4>Suggested improvement · {GAP_KIND[r.gap_type]}</h4>
          <p className="small">{r.improvement}</p>
          <p className="small muted mt-1">{GAP_EXPLAIN[r.gap_type]}</p>
        </div>
      )}

      {Object.keys(r.rule_results).length > 0 && (
        <details className="tech-details">
          <summary>Rule checks ({Object.keys(r.rule_results).length})</summary>
          <ul className="plain mt-1">
            {Object.entries(r.rule_results).map(([k, v]) => <li key={k}><code>{k}</code> {v}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   5. Gaps and uncertainties
   -------------------------------------------------------------------------- */

export function GapsAndQuestions({ ev, onUpdated }: { ev: EvaluationOut; onUpdated: (e: EvaluationOut) => void }) {
  const qs = ev.content!.clarifications;
  const eligibility = ev.scorecard.content!.eligibility;
  const results = ev.content!.results;
  const confirmed = results.filter((r) => r.classification === "confirmed_absent").length;
  const notShown = results.filter((r) => r.classification === "not_demonstrated").length;
  const summary =
    notShown === 0 && confirmed === 0
      ? "Every criterion has some evidence in the resume."
      : [
          notShown > 0 && `${notShown} ${notShown === 1 ? "criterion isn't" : "criteria aren't"} shown in the resume.`,
          confirmed > 0 && `${confirmed} confirmed ${confirmed === 1 ? "gap" : "gaps"} from your answers.`,
        ]
          .filter(Boolean)
          .join(" ");

  return (
    <Section
      title="Gaps and open questions"
      description="Where the resume is silent, the app asks instead of assuming. Your answers are kept separate from the resume and never written into it."
    >
      <p className="small">{summary}</p>
      {qs.length ? <Questions ev={ev} onUpdated={onUpdated} /> : <Empty>No open questions.</Empty>}
      {eligibility.length > 0 && (
        <div>
          <h3 className="small">Not scored: confirm these yourself</h3>
          <p className="small muted">A resume can't show these conditions, so they don't affect the scores.</p>
          <ul className="plain small mt-1">{eligibility.map((e) => <li key={e.id}>{e.text}</li>)}</ul>
        </div>
      )}
    </Section>
  );
}

function Questions({ ev, onUpdated }: { ev: EvaluationOut; onUpdated: (e: EvaluationOut) => void }) {
  const qs = ev.content!.clarifications;
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);

  async function send(qid: string, kind: "yes" | "no" | "detail", text = "") {
    setBusy(qid);
    setError(null);
    try {
      await api.answerQuestion(ev.id, qid, kind, text);
      setAnswered((a) => ({ ...a, [qid]: kind === "detail" ? text : kind === "yes" ? "Yes" : "No" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function reevaluate() {
    setBusy("rerun");
    setError(null);
    try {
      onUpdated(await api.reevaluate(ev.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }
  const newAnswers = Object.keys(answered).length;
  const shown = showAll ? qs : qs.slice(0, 4);

  return (
    <div className="panel">
      <ul className="q-list">
        {shown.map((q) => {
          const done = answered[q.id] ?? q.answer;
          const text = (detail[q.id] ?? "").trim();
          return (
            <li key={q.id} className="q-item">
              <div>
                <div>{q.question}</div>
                {q.why && <div className="q-why">{q.why}</div>}
              </div>
              {done ? (
                <div className="q-answer">Answered: {done}</div>
              ) : (
                <div className="q-actions">
                  {q.criterion_id && (
                    <>
                      <label className="sr-only" htmlFor={`q-${q.id}`}>Describe briefly</label>
                      <input
                        id={`q-${q.id}`}
                        className="q-input"
                        placeholder="Describe briefly (optional)"
                        value={detail[q.id] ?? ""}
                        onChange={(e) => setDetail({ ...detail, [q.id]: e.target.value })}
                      />
                      {text.length >= 3 && (
                        <button className="btn btn-sm" disabled={!!busy} onClick={() => send(q.id, "detail", text)}>Save</button>
                      )}
                    </>
                  )}
                  <button className="btn btn-sm" disabled={!!busy} onClick={() => send(q.id, "yes", "Yes")}>Yes</button>
                  <button className="btn btn-sm" disabled={!!busy} onClick={() => send(q.id, "no", "No")}>No</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {(qs.length > 4 || error || newAnswers > 0) && (
        <div className="row mt-3">
          {qs.length > 4 && (
            <button className="link-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${qs.length} questions`}
            </button>
          )}
          <span className="spacer" />
          {error && <span className="text-bad small">{error}</span>}
          {newAnswers > 0 && (
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={reevaluate}>
              {busy === "rerun" ? "Starting…" : `Re-evaluate with your answer${newAnswers > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   6. Prioritized improvements
   -------------------------------------------------------------------------- */

export function ImprovementsList({ ev }: { ev: EvaluationOut }) {
  const items = [...ev.content!.improvements].sort(
    (a, b) => GAP_PRIORITY[a.gap_type] - GAP_PRIORITY[b.gap_type] || b.weight - a.weight,
  );
  return (
    <Section
      title="What would improve your candidacy"
      description="Ordered by what you can act on now: truthful rewording first, then details only you can confirm, then genuine gaps."
    >
      {items.length ? (
        <ol className="improve-list">
          {items.map((i) => (
            <li key={i.criterion_id} className="improve-item">
              <div>
                <div className="cell-title">{i.criterion_name}</div>
                <p className="small muted mt-1">{i.action}</p>
              </div>
              <div className="improve-kind">
                {GAP_KIND[i.gap_type]}
                <div className="faint tabular">{i.weight}% weight</div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>No improvements suggested. The resume already covers this scorecard well.</Empty>
      )}
    </Section>
  );
}

/* --------------------------------------------------------------------------
   Detailed checks and progress
   -------------------------------------------------------------------------- */

const DIAG_TONE: Record<RuleOutcome["status"], Tone> = { pass: "good", warn: "warn", fail: "bad", info: "neutral" };
const DIAG_TEXT: Record<RuleOutcome["status"], string> = { pass: "Pass", warn: "Check", fail: "Fix", info: "Info" };

/** Resume diagnostics (ATS, keywords, writing, impact) and scorecard validation. */
export function DetailedChecks({ ev }: { ev: EvaluationOut }) {
  const diags = ev.content?.diagnostics ?? [];
  const checks = ev.scorecard.content?.validation ?? [];
  const groups: [string, RuleOutcome[]][] = [
    ["ATS and keywords", diags.filter((d) => d.rule_id.startsWith("ATS") || d.rule_id.startsWith("KEY"))],
    ["Writing and impact", diags.filter((d) => d.rule_id.startsWith("WRT") || d.rule_id.startsWith("IMP"))],
  ];
  return (
    <div className="grid-2 align-start">
      {groups.map(([title, list]) => (
        <Card key={title} title={title}>
          {list.length ? (
            <ul className="items">
              {list.map((d) => (
                <li key={d.rule_id}>
                  <div className="item-head">
                    <span className="small">{d.name}</span>
                    <span className="small"><Status tone={DIAG_TONE[d.status]}>{DIAG_TEXT[d.status]}</Status></span>
                  </div>
                  <p className="small muted">{d.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No checks.</Empty>
          )}
        </Card>
      ))}
      <Card title="Scorecard validation">
        <ul className="items">
          {checks.map((v) => (
            <li key={v.name}>
              <div className="item-head">
                <span className="small">{v.name}</span>
                <span className="small">
                  <Status tone={v.passed ? "good" : v.fixed ? "warn" : "bad"}>{v.passed ? "Pass" : v.fixed ? "Fixed" : "Fail"}</Status>
                </span>
              </div>
              <p className="small muted">{v.detail}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function EvaluationProgress({ ev }: { ev: EvaluationOut }) {
  return (
    <div className="panel">
      <Spinner label={`${ev.progress || "Scoring against the hiring scorecard"}…`} />
    </div>
  );
}
