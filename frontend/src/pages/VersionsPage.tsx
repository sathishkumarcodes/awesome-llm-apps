import { Link } from "react-router-dom";
import { api } from "../api";
import { isRunning, useLoad } from "../hooks";
import { RerunButton } from "../components/rerun";
import { ErrorBox, IconChevronRight, Spinner, Status, formatDate, formatDay, friendlyError } from "../components/ui";
import type { VersionSummary } from "../types";

export default function VersionsPage() {
  const { data, error, loading, reload } = useLoad(() => api.listVersions(), [], (vs) => vs.some(isRunning), 3000);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tailored resumes</h1>
          <p className="sub">Each version is tailored to one job. Review its changes, then export.</p>
        </div>
      </div>
      <ErrorBox message={error && friendlyError(error)} />
      {loading ? (
        <div className="list"><div className="list-empty"><Spinner label="Loading…" /></div></div>
      ) : !data?.length ? (
        !error && (
          <div className="list">
            <div className="list-empty empty-state">
              <strong>No tailored resumes yet</strong>
              <span>Open an analysis and choose Tailor resume to create one.</span>
              <Link to="/" className="btn">Go to analyses</Link>
            </div>
          </div>
        )
      ) : (
        <div className="list versions" role="table" aria-label="Tailored resumes">
          <div className="list-head" role="row">
            <span role="columnheader">Version</span>
            <span role="columnheader">Mode</span>
            <span role="columnheader">Review</span>
            <span role="columnheader">Created</span>
            <span role="columnheader"><span className="sr-only">Actions</span></span>
          </div>
          {data.map((v) => <VersionRow key={v.id} v={v} onRetry={reload} />)}
        </div>
      )}
    </div>
  );
}

function VersionRow({ v, onRetry }: { v: VersionSummary; onRetry: () => void }) {
  const r = v.factuality_report;
  const failed = v.status === "failed";
  return (
    <Link to={`/versions/${v.id}`} className="list-row" role="row">
      <div role="cell" className="cell-main">
        <div className="cell-title">{v.name}</div>
        <div className="insight">
          {failed ? <span className="text-bad">{friendlyError(v.error, "Tailoring didn't finish.")}</span> : <>{v.job_title}{v.company && ` at ${v.company}`}</>}
        </div>
      </div>
      <div role="cell" className="cell-sub hide-sm">{v.tailoring_mode[0].toUpperCase() + v.tailoring_mode.slice(1)}</div>
      <div role="cell" className="small">
        {v.status === "complete" && r ? (
          r.pending > 0 ? (
            <Status tone="warn">{r.pending} to review</Status>
          ) : v.exported ? (
            <Status tone="good">Exported · {r.accepted} accepted</Status>
          ) : (
            <Status tone="neutral">Ready to export · {r.accepted} accepted</Status>
          )
        ) : isRunning(v) ? (
          <span className="row"><span className="spinner" aria-hidden />{v.progress || "Working"}</span>
        ) : (
          <Status tone="bad">Failed</Status>
        )}
      </div>
      <div role="cell" className="cell-sub hide-sm" title={formatDate(v.created_at)}>{formatDay(v.created_at)}</div>
      <div role="cell" className={`cell-action ${failed ? "" : "hide-sm"}`}>
        {failed ? (
          <RerunButton compact onRerun={async () => { await api.rerunVersion(v.id); onRetry(); }} />
        ) : (
          <><span className="sr-only">Open</span><IconChevronRight /></>
        )}
      </div>
    </Link>
  );
}
