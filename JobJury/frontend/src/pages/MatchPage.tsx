import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { isRunning, useLoad } from "../hooks";
import {
  Card,
  DECISION_TONE,
  sentenceCase,
  Empty,
  ErrorBox,
  EvidenceList,
  IconChevronRight,
  Metric,
  Section,
  SeverityPill,
  Spinner,
  Status,
  SupportPill,
  Tabs,
  TechnicalDetails,
  formatDate,
  friendlyError,
} from "../components/ui";
import { ModelNotice } from "../components/models";
import { FailedBanner } from "../components/rerun";
import { JobParseNotice } from "../components/jobnotice";
import {
  AnalysisSummary,
  DetailedChecks,
  EvaluationProgress,
  GapsAndQuestions,
  ImprovementsList,
  Perspectives,
  ScorecardTable,
} from "../components/scorecard";
import type { EvaluationOut, EvaluatorResult, Insight, MatchDetail, MatchResult, RequirementAssessment, Risk, TailoringMode } from "../types";

type Tab = "overview" | "recruiter" | "hiring_manager" | "requirements" | "seniority" | "checks";

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const { data: m, error, loading, reload } = useLoad(() => api.getMatch(id!), [id], isRunning);
  const complete = m?.status === "complete";
  // The scorecard evaluation (newest for this analysis); polls while a re-evaluation runs.
  const evalLoad = useLoad(
    () => (complete ? api.matchEvaluation(id!) : Promise.reject(new Error("pending"))),
    [id, complete],
    isRunning,
    2000,
  );
  const ev = evalLoad.data;

  if (loading) {
    return <div className="page"><Spinner label="Loading analysis…" /></div>;
  }
  if (!m) {
    return (
      <div className="page">
        <ErrorBox message={friendlyError(error, "This analysis couldn't be found.")} />
        <Link to="/">Back to analyses</Link>
      </div>
    );
  }

  const hasScorecard = !!(m.result && ev?.content && ev.scorecard.content);
  const evaluating = !!(m.result && ev && !ev.content && isRunning(ev));

  return (
    <div className="page">
      <div className="crumbs"><Link to="/">Analyses</Link></div>
      <header className="page-head">
        <div>
          <h1>{m.job_title || "Untitled role"}</h1>
          <p className="meta">
            {m.company && <>{m.company}<span className="meta-sep">·</span></>}
            {m.resume_filename}
            <span className="meta-sep">·</span>
            {formatDate(m.created_at)}
          </p>
        </div>
        {m.result && (
          <button className="btn" onClick={() => document.getElementById("tailor")?.scrollIntoView({ behavior: "smooth" })}>
            Tailor resume
          </button>
        )}
      </header>
      {error && m && <ErrorBox message={friendlyError(error)} />}

      {isRunning(m) && (
        <div className="panel stack-sm">
          <Spinner label={`${m.progress || "Queued"}…`} />
          <p className="small muted">
            Reading the job description and your resume. Local models can take several minutes; you can leave this page.
          </p>
        </div>
      )}
      {m.status === "failed" && (
        <FailedBanner
          title="This analysis didn't finish"
          message={m.error}
          onRerun={async () => {
            await api.rerunMatch(m.id);
            reload();
          }}
        />
      )}

      {m.result && <JobParseNotice jobId={m.job_id} resumeId={m.resume_id} />}

      {evaluating && ev && <EvaluationProgress ev={ev} />}
      {m.result && ev?.status === "failed" && !ev.content && (
        <div className="callout callout-error" role="alert">
          <div className="callout-title">The hiring scorecard couldn't be scored</div>
          <div>{friendlyError(ev.error)} The requirement-by-requirement analysis below is still available.</div>
          <TechnicalDetails text={ev.error} />
        </div>
      )}

      {hasScorecard && ev && (
        <>
          <AnalysisSummary ev={ev} />
          <Perspectives ev={ev} />
          <ScorecardTable ev={ev} />
          <GapsAndQuestions ev={ev} onUpdated={() => evalLoad.reload()} />
          <ImprovementsList ev={ev} />
          <TailorSection m={m} />
          <DetailedEvaluation r={m.result!} ev={ev} />
          <p className="disclaimer">
            A structured, job-specific review based only on your resume and the job description. It isn't a prediction of
            what this employer will decide, and scores aren't interview probabilities.
          </p>
        </>
      )}

      {m.result && !hasScorecard && !evaluating && (
        <>
          <LegacySummary r={m.result} />
          <TailorSection m={m} />
          <DetailedEvaluation r={m.result} open />
          <p className="disclaimer">{m.result.disclaimer}</p>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Tailor
   -------------------------------------------------------------------------- */

const MODES: [TailoringMode, string, string][] = [
  ["minimal", "Minimal", "Light rewording of the most relevant lines."],
  ["recommended", "Recommended", "Rewrites, a summary, and reordering toward this job."],
  ["aggressive", "Aggressive", "Rewrites as much as the evidence allows. More to review."],
];

function TailorSection({ m }: { m: MatchDetail }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<TailoringMode>("recommended");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const v = await api.tailor(m.resume_id, m.id, mode);
      nav(`/versions/${v.id}`);
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
      setBusy(false);
    }
  }

  return (
    <Section
      id="tailor"
      title="Tailor your resume"
      description="Proposes edits that use only facts already in your resume, aimed at the criteria where your evidence is easy to miss. Every change is fact-checked, and you approve each one."
    >
      <div className="tailor">
        <div className="choice-list" role="radiogroup" aria-label="How much to change">
          {MODES.map(([k, label, desc]) => (
            <label key={k} className={`choice ${mode === k ? "checked" : ""}`}>
              <input type="radio" name="mode" checked={mode === k} onChange={() => setMode(k)} />
              <div>
                <div className="choice-title">{label}</div>
                <div className="choice-desc">{desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="tailor-side">
          <button className="btn btn-primary btn-lg full" onClick={go} disabled={busy}>
            {busy ? "Starting…" : "Generate tailored version"}
          </button>
          <ModelNotice />
          <p className="small muted">Your original resume is never changed. Tailored versions are saved separately.</p>
          <ErrorBox message={error} />
        </div>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------------
   Fallback summary (analyses without a scorecard evaluation)
   -------------------------------------------------------------------------- */

function LegacySummary({ r }: { r: MatchResult }) {
  const rec = r.recommendation;
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
          {rec.why && <p className="small muted mt-2">{rec.why}</p>}
          {rec.deciding_factors.length > 0 && (
            <ul className="why">{rec.deciding_factors.map((f, i) => <li key={i}>{f}</li>)}</ul>
          )}
        </div>
        <div className="metrics">
          <Metric value={r.overall_score} label="Overall fit" />
          <Metric value={r.recruiter.score} label="Recruiter" />
          <Metric value={r.hiring_manager.score} label="Hiring manager" />
        </div>
      </div>
      <div className="summary-foot">
        <span className="faint xs">This analysis has no hiring scorecard. Run a new analysis to get one.</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Detailed evaluation (requirement-by-requirement)
   -------------------------------------------------------------------------- */

function DetailedEvaluation({ r, ev, open = false }: { r: MatchResult; ev?: EvaluationOut; open?: boolean }) {
  const [tab, setTab] = useState<Tab>("requirements");
  const tabs: [Tab, string][] = [
    ["requirements", `Requirements (${r.requirements.length})`],
    ["recruiter", "Recruiter categories"],
    ["hiring_manager", "Hiring manager categories"],
    ["overview", "Strengths and risks"],
    ["seniority", "Seniority"],
    ...(ev ? ([["checks", "Resume checks"]] as [Tab, string][]) : []),
  ];
  return (
    <section className="section">
      <details className="detailed" open={open}>
        <summary>
          <span className="sc-chevron"><IconChevronRight /></span>
          Detailed evaluation
          <span className="detailed-hint">Each requirement checked separately, category scores, seniority, resume checks</span>
        </summary>
        <div className="detailed-body">
          <Tabs<Tab> tabs={tabs} value={tab} onChange={setTab} />
          {tab === "overview" && <Overview r={r} />}
          {tab === "recruiter" && <EvaluatorView e={r.recruiter} />}
          {tab === "hiring_manager" && <EvaluatorView e={r.hiring_manager} />}
          {tab === "requirements" && <Requirements r={r} />}
          {tab === "seniority" && <Seniority r={r} />}
          {tab === "checks" && ev && <DetailedChecks ev={ev} />}
        </div>
      </details>
    </section>
  );
}

function InsightList({ items, empty }: { items: Insight[]; empty: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="items">
      {items.map((it, i) => (
        <li key={i}>
          <div className="item-head">
            <strong className="small">{it.title}</strong>
            <span className="small"><SupportPill support={it.support} /></span>
          </div>
          {it.detail && <p className="small muted">{it.detail}</p>}
          <EvidenceList evidence={it.evidence} />
        </li>
      ))}
    </ul>
  );
}

function RiskList({ items, empty }: { items: Risk[]; empty: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="items">
      {items.map((it, i) => (
        <li key={i}>
          <div className="item-head">
            <strong className="small">{it.title}</strong>
            <span className="small"><SeverityPill severity={it.severity} /></span>
          </div>
          {it.detail && <p className="small muted">{it.detail}</p>}
          <EvidenceList evidence={it.evidence} />
        </li>
      ))}
    </ul>
  );
}

function Overview({ r }: { r: MatchResult }) {
  return (
    <div className="grid-2 align-start">
      <Card title="Why you match"><InsightList items={r.why_match} empty="No strong matches found." /></Card>
      <Card title="Screening risks"><RiskList items={r.rejection_risks} empty="No major screening risks." /></Card>
      <Card title="What would make it stronger">
        {r.improvements.length ? (
          <ul className="items">
            {r.improvements.map((it, i) => (
              <li key={i}>
                <div className="item-head">
                  <strong className="small">{it.action}</strong>
                  <span className="small"><SeverityPill severity={it.impact} /></span>
                </div>
                <p className="small muted">{it.rationale}</p>
                <EvidenceList evidence={it.evidence} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No suggestions.</Empty>
        )}
      </Card>
      <Card title="Hiring manager concerns"><RiskList items={r.hiring_manager_concerns} empty="None raised." /></Card>
      {r.gaps.length > 0 && (
        <Card title="Gaps">
          <ul className="plain small">{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

function EvaluatorView({ e }: { e: EvaluatorResult }) {
  const concerns: [string, Risk[]][] = [
    ["Resume concerns", e.resume_concerns],
    ["Trajectory concerns", e.trajectory_concerns],
    ["Seniority concerns", e.seniority_concerns],
  ];
  return (
    <div className="stack">
      <Card>
        <div className="row">
          <Metric value={e.score} label={e.question} />
        </div>
        <p className="mt-2">{e.headline}</p>
        <table className="cats mt-3">
          <tbody>
            {e.categories.map((c) => (
              <tr key={c.key}>
                <td>
                  <strong>{c.label}</strong>
                  {c.rationale && <div className="muted">{c.rationale}</div>}
                  <EvidenceList evidence={c.evidence} />
                </td>
                <td className="cat-pts">{c.points.toFixed(1)} of {c.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid-2 align-start">
        <Card title="Strengths"><InsightList items={e.strengths} empty="None identified." /></Card>
        <Card title="Risks"><RiskList items={e.risks} empty="None identified." /></Card>
        {e.missing_requirements.length > 0 && (
          <Card title="Missing requirements">
            <ul className="plain small">{e.missing_requirements.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </Card>
        )}
        {concerns.filter(([, l]) => l.length).map(([t, l]) => (
          <Card key={t} title={t}><RiskList items={l} empty="" /></Card>
        ))}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  must_have: "Must have",
  preferred: "Preferred",
  responsibility: "Responsibilities",
  nice_to_have: "Nice to have",
};
const STATUS_LABEL: Record<RequirementAssessment["status"], [string, "good" | "warn" | "open"]> = {
  demonstrated: ["Shown", "good"],
  partial: ["Partly shown", "warn"],
  not_demonstrated: ["Not shown", "open"],
};

function Requirements({ r }: { r: MatchResult }) {
  const [filter, setFilter] = useState<"all" | "gaps">("all");
  const rows = r.requirements.filter((a) => filter === "all" || a.status !== "demonstrated");
  const order = ["must_have", "preferred", "responsibility", "nice_to_have"];
  const groups = order.map((k) => [k, rows.filter((a) => a.kind === k)] as const).filter(([, l]) => l.length);
  return (
    <div className="stack">
      <Tabs<"all" | "gaps"> tabs={[["all", "All"], ["gaps", "Only gaps"]]} value={filter} onChange={setFilter} />
      {!groups.length && <Empty>Nothing to show.</Empty>}
      {groups.map(([kind, list]) => (
        <Card key={kind} title={KIND_LABEL[kind] ?? kind}>
          <ul className="items">
            {list.map((a) => {
              const [label, tone] = STATUS_LABEL[a.status];
              return (
                <li key={a.requirement_id}>
                  <div className="item-head">
                    <span className="small">{a.text}</span>
                    <span className="small"><Status tone={tone}>{label}</Status></span>
                  </div>
                  <p className="small muted">{a.rationale}</p>
                  <EvidenceList evidence={a.evidence} />
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      {(r.logistics?.length ?? 0) > 0 && (
        <Card title="Not scored: confirm these yourself">
          <p className="small muted">A resume can't show these conditions, so they don't affect the scores.</p>
          <ul className="plain small mt-2">{r.logistics!.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </Card>
      )}
      {r.inferred_signals.length > 0 && (
        <Card title="Inferred signals (not stated in the job)">
          <ul className="items">
            {r.inferred_signals.map((a) => (
              <li key={a.requirement_id}>
                <div className="item-head">
                  <span className="small">{a.text}</span>
                  <span className="small"><SupportPill support={a.support} /></span>
                </div>
                <p className="small muted">{a.rationale}</p>
                <EvidenceList evidence={a.evidence} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Seniority({ r }: { r: MatchResult }) {
  const s = r.seniority;
  const range = s.demonstrated_low === s.demonstrated_high ? s.demonstrated_low : `${s.demonstrated_low} – ${s.demonstrated_high}`;
  return (
    <div className="stack">
      <Card>
        <dl className="kv-row">
          <div><dt>Role level</dt><dd>{s.role_level || "—"}</dd></div>
          <div><dt>Your current title level</dt><dd>{s.title_level || "—"}</dd></div>
          <div><dt>Shown in resume</dt><dd>{range || "—"}</dd></div>
        </dl>
        <p className="small mt-3">{s.explanation}</p>
      </Card>
      {s.dimensions.length > 0 && (
        <Card title="By dimension">
          <ul className="items">
            {s.dimensions.map((d, i) => (
              <li key={i}>
                <div className="item-head">
                  <strong className="small">{d.dimension}</strong>
                  <span className="small muted">{d.level}</span>
                </div>
                {d.note && <p className="small muted">{d.note}</p>}
                <EvidenceList evidence={d.evidence} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
