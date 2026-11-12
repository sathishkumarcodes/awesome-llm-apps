import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { isRunning, useLoad } from "../hooks";
import { RerunButton } from "../components/rerun";
import {
  DecisionBadge,
  ErrorBox,
  IconChevronRight,
  IconSearch,
  Segmented,
  Spinner,
  Status,
  formatDate,
  formatDay,
  friendlyError,
} from "../components/ui";
import type { MatchSummary } from "../types";

type Filter = "all" | "complete" | "running" | "failed";

const matchesFilter = (m: MatchSummary, f: Filter) =>
  f === "all" || (f === "running" ? isRunning(m) : m.status === f);

export default function Dashboard() {
  const { data, error, loading, reload } = useLoad(
    () => api.listMatches(),
    [],
    (ms) => ms.some(isRunning),
    3000,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (m) =>
        matchesFilter(m, filter) &&
        (!q || [m.job_title, m.company, m.resume_filename].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [data, query, filter]);

  const count = (f: Filter) => (data ?? []).filter((m) => matchesFilter(m, f)).length;
  const filters: [Filter, string][] = [
    ["all", `All ${count("all")}`],
    ["complete", `Complete ${count("complete")}`],
    ["running", `In progress ${count("running")}`],
    ["failed", `Failed ${count("failed")}`],
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Analyses</h1>
          <p className="sub">How your resume reads against each job you've checked.</p>
        </div>
      </div>

      <ErrorBox message={error && friendlyError(error)} />

      {loading ? (
        <div className="list"><div className="list-empty"><Spinner label="Loading analyses…" /></div></div>
      ) : !data?.length ? (
        !error && (
          <div className="list">
            <div className="list-empty empty-state">
              <strong>No analyses yet</strong>
              <span>Add a resume and a job description to see how well they match.</span>
              <Link to="/new" className="btn btn-primary">New analysis</Link>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="toolbar">
            <label className="search">
              <IconSearch />
              <span className="sr-only">Search analyses</span>
              <input
                type="search"
                placeholder="Search by role, company or resume"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <Segmented<Filter> label="Status" options={filters} value={filter} onChange={setFilter} />
          </div>

          <div className="list analyses" role="table" aria-label="Analyses">
            <div className="list-head" role="row">
              <span role="columnheader">Role</span>
              <span role="columnheader">Resume</span>
              <span role="columnheader">Analyzed</span>
              <span role="columnheader">Recommendation</span>
              <span role="columnheader" className="right">Fit</span>
              <span role="columnheader"><span className="sr-only">Actions</span></span>
            </div>
            {rows.length === 0 ? (
              <div className="list-empty">No analyses match these filters.</div>
            ) : (
              rows.map((m) => <AnalysisRow key={m.id} m={m} onRetry={reload} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AnalysisRow({ m, onRetry }: { m: MatchSummary; onRetry: () => void }) {
  const failed = m.status === "failed";
  const running = isRunning(m);
  const complete = m.status === "complete";

  let insight: ReactNode = null;
  if (complete && m.top_issue) insight = m.top_issue;
  else if (running) insight = m.progress ? `${m.progress}…` : "Waiting to start…";
  else if (failed) insight = friendlyError(m.error, "The analysis didn't finish.");

  return (
    <Link to={`/matches/${m.id}`} className="list-row" role="row">
      <div role="cell" className="cell-main">
        <div className="cell-title">
          {m.job_title || "Untitled role"}
          {m.company && <span className="cell-company"> · {m.company}</span>}
        </div>
        {insight && <div className={`insight ${failed ? "text-bad" : ""}`}>{insight}</div>}
      </div>
      <div role="cell" className="cell-sub truncate hide-sm" title={m.resume_filename}>{m.resume_filename}</div>
      <div role="cell" className="cell-sub hide-sm" title={formatDate(m.created_at)}>{formatDay(m.created_at)}</div>
      <div role="cell" className="small">
        {complete ? (
          <DecisionBadge decision={m.recommendation} label={m.recommendation_label} />
        ) : running ? (
          <span className="row"><span className="spinner" aria-hidden />{m.status === "pending" ? "Queued" : "Analyzing"}</span>
        ) : (
          <Status tone="bad">Failed</Status>
        )}
      </div>
      <div role="cell" className="cell-num hide-sm">
        {complete && m.overall_score != null ? Math.round(m.overall_score) : <span className="faint">—</span>}
      </div>
      <div role="cell" className={`cell-action ${failed ? "" : "hide-sm"}`}>
        {failed ? (
          <RerunButton compact onRerun={async () => { await api.rerunMatch(m.id); onRetry(); }} />
        ) : (
          <><span className="sr-only">Open</span><IconChevronRight /></>
        )}
      </div>
    </Link>
  );
}
