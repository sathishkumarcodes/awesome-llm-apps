import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { isRunning, useLoad } from "../hooks";
import { ErrorBox, FactualityPill, Spinner, Status, Tabs, formatDate, friendlyError, type Tone } from "../components/ui";
import { FailedBanner } from "../components/rerun";
import type { Change, ChangeDecision, VersionDetail } from "../types";

type Filter = "all" | ChangeDecision;
type Format = "original" | "pdf" | "docx";

const DECISION_TEXT: Record<ChangeDecision, [string, Tone]> = {
  accepted: ["Accepted", "good"],
  pending: ["Needs your review", "warn"],
  rejected: ["Rejected", "neutral"],
};

export default function VersionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: v, error, loading, setData, reload } = useLoad(() => api.getVersion(id!), [id], isRunning);
  // Scorecard criterion names, to show which criteria each change targets.
  const matchId = v?.match_id;
  const { data: ev } = useLoad(
    () => (matchId ? api.matchEvaluation(matchId) : Promise.reject(new Error("none"))),
    [matchId],
  );
  const criterionNames = new Map((ev?.scorecard.content?.criteria ?? []).map((c) => [c.id, c.name]));
  const [filter, setFilter] = useState<Filter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** Run a mutation that returns the updated version; surface backend errors inline. */
  async function mutate(key: string, fn: () => Promise<VersionDetail>) {
    setBusy(key);
    setActionError(null);
    try {
      setData(await fn());
    } catch (e) {
      setActionError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  const changes = useMemo(
    () => (v?.changes ?? []).filter((c) => filter === "all" || c.decision === filter),
    [v, filter],
  );

  if (loading) return <div className="page"><Spinner label="Loading tailored version…" /></div>;
  if (!v) {
    return (
      <div className="page">
        <ErrorBox message={friendlyError(error, "This tailored version couldn't be found.")} />
        <Link to="/versions">Back to tailored resumes</Link>
      </div>
    );
  }

  const counts = {
    all: v.changes.length,
    pending: v.changes.filter((c) => c.decision === "pending").length,
    accepted: v.changes.filter((c) => c.decision === "accepted").length,
    rejected: v.changes.filter((c) => c.decision === "rejected").length,
  };

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/versions">Tailored resumes</Link>
        {v.match_id && <> / <Link to={`/matches/${v.match_id}`}>{v.job_title || "Analysis"}</Link></>}
      </div>
      <header className="page-head">
        <div>
          <h1 className="break">{v.name}</h1>
          <p className="meta">
            From {v.original_filename}
            <span className="meta-sep">·</span>
            {v.job_title}{v.company && ` at ${v.company}`}
            <span className="meta-sep">·</span>
            {v.tailoring_mode[0].toUpperCase() + v.tailoring_mode.slice(1)} mode
            <span className="meta-sep">·</span>
            {formatDate(v.created_at)}
          </p>
        </div>
      </header>
      <ErrorBox message={error && friendlyError(error)} />

      {isRunning(v) && (
        <div className="panel stack-sm">
          <Spinner label={`${v.progress || "Queued"}…`} />
          <p className="small muted">Drafting edits and fact-checking each one against your resume.</p>
        </div>
      )}
      {v.status === "failed" && (
        <FailedBanner
          title="Tailoring didn't finish"
          message={v.error}
          onRerun={async () => {
            await api.rerunVersion(v.id);
            reload();
          }}
        />
      )}

      {v.status === "complete" && (
        <div className="review">
          <div className="stack">
            <Tabs<Filter>
              tabs={[
                ["all", `All ${counts.all}`],
                ["pending", `Needs review ${counts.pending}`],
                ["accepted", `Accepted ${counts.accepted}`],
                ["rejected", `Rejected ${counts.rejected}`],
              ]}
              value={filter}
              onChange={setFilter}
            />
            <ErrorBox message={actionError} />
            {!changes.length ? (
              <div className="list"><div className="list-empty">
                {counts.all === 0 ? "No changes were proposed. The resume already reads well for this job." : "No changes in this view."}
              </div></div>
            ) : (
              <div>
                {changes.map((c) => (
                  <ChangeReview
                    key={c.id}
                    c={c}
                    criterionNames={criterionNames}
                    busy={busy}
                    onDecide={(d) => mutate(`${c.id}:${d}`, () => api.decideChange(v.id, c.id, d))}
                    onEdit={(text) => mutate(`${c.id}:edit`, () => api.editChange(v.id, c.id, text))}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="review-aside">
            <ReviewSummary v={v} counts={counts} busy={busy} onRecheck={() => mutate("validate", () => api.validate(v.id))} />
            <ExportPanel v={v} busy={busy} mutate={mutate} pending={counts.pending} />
          </aside>
        </div>
      )}
    </div>
  );
}

function ReviewSummary({ v, counts, busy, onRecheck }: {
  v: VersionDetail;
  counts: Record<Filter, number>;
  busy: string | null;
  onRecheck: () => void;
}) {
  const r = v.factuality_report;
  return (
    <div className="panel stack-sm">
      <h3>Review</h3>
      <div className="review-summary">
        <div className="line"><span>Proposed changes</span><span>{counts.all}</span></div>
        <div className="line"><span>Needs your review</span><span>{counts.pending}</span></div>
        <div className="line"><span>Accepted</span><span>{counts.accepted}</span></div>
        <div className="line"><span>Rejected</span><span>{counts.rejected}</span></div>
      </div>
      {r && (
        <>
          <h3 className="mt-2">Fact check</h3>
          <div className="review-summary">
            <div className="line"><span>Supported by resume</span><span>{r.supported}</span></div>
            <div className="line"><span>Partly supported</span><span>{r.partially_supported}</span></div>
            <div className="line"><span>Not supported</span><span>{r.unsupported}</span></div>
          </div>
        </>
      )}
      <p className="xs muted">
        Supported changes start accepted. Partly supported ones wait for you. Changes that add facts not in your resume
        can't be accepted until you edit them.
      </p>
      <button className="btn btn-sm" disabled={!!busy} onClick={onRecheck}>
        {busy === "validate" ? "Checking…" : "Re-run fact check"}
      </button>
    </div>
  );
}

function ExportPanel({ v, busy, mutate, pending }: {
  v: VersionDetail;
  busy: string | null;
  mutate: (k: string, fn: () => Promise<VersionDetail>) => void;
  pending: number;
}) {
  const [format, setFormat] = useState<Format>("original");
  const formats: [Format, string][] = [
    ["original", `Same as original (${v.file_type.toUpperCase()})`],
    ...(v.file_type === "pdf" ? ([["docx", "DOCX (simple layout)"]] as [Format, string][]) : []),
  ];
  return (
    <div className="panel stack-sm">
      <h3>Export</h3>
      {pending > 0 ? (
        <p className="small">Review the {pending} pending change{pending > 1 ? "s" : ""} before exporting.</p>
      ) : (
        <p className="small muted">Only accepted changes are applied. Your original file stays unchanged.</p>
      )}
      {formats.length > 1 && (
        <label className="field">
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {formats.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      )}
      <button
        className="btn btn-primary"
        disabled={pending > 0 || !!busy}
        onClick={() => mutate("export", () => api.exportVersion(v.id, format))}
      >
        {busy === "export" ? "Exporting…" : v.exported ? "Export again" : "Export resume"}
      </button>
      {v.exported && (
        <div className="stack-sm">
          <a className="btn" href={api.downloadUrl(v.id)}>Download resume</a>
          <a className="btn" href={api.reportUrl(v.id)}>Download change report</a>
        </div>
      )}
      {v.export_notes && v.export_notes.length > 0 && (
        <ul className="notes">{v.export_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<Change["type"], string> = {
  rewrite: "Rewrite",
  summary: "Summary",
  reorder: "Reordered bullets",
  skills: "Reordered skills",
};

function ChangeReview({ c, criterionNames, busy, onDecide, onEdit }: {
  c: Change;
  criterionNames: Map<string, string>;
  busy: string | null;
  onDecide: (d: ChangeDecision) => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.proposed);
  const f = c.factuality;
  const unsupported = f?.status === "UNSUPPORTED";
  const editable = c.type === "rewrite" || c.type === "summary";
  const disabled = !!busy;
  const targets = (c.target_criterion_ids ?? []).filter((t) => criterionNames.has(t)).map((t) => criterionNames.get(t)!);
  const [decisionText, decisionTone] = DECISION_TEXT[c.decision];
  const hasBody = !!c.reason || !!f?.supporting_evidence.length || !!f?.issues.length || !!f?.llm_explanation;

  return (
    <article className={`change decision-${c.decision}`}>
      <header className="change-head">
        <div className="change-where">
          <strong>{TYPE_LABEL[c.type]}</strong>
          {c.section && <span>· {c.section}</span>}
          {c.user_edited && <span className="tag">Edited by you</span>}
          {targets.length > 0 && <span title="Scorecard criteria this change makes more visible">· For: {targets.join(", ")}</span>}
        </div>
        <div className="change-state">
          {f && <span className="xs"><FactualityPill status={f.status} /></span>}
          <span className="decision-text"><Status tone={decisionTone}>{decisionText}</Status></span>
        </div>
      </header>

      {editing ? (
        <div className="change-edit">
          <div>
            <div className="diff-label">Original</div>
            <div className="diff-text">{c.original}</div>
          </div>
          <label className="field">
            <span>Your version</span>
            <textarea rows={4} maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <div className="row">
            <button
              className="btn btn-primary btn-sm"
              disabled={disabled || !draft.trim()}
              onClick={() => {
                onEdit(draft);
                setEditing(false);
              }}
            >
              Save and re-check
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDraft(c.proposed); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="diff">
          {/* Reorders keep the same content, so a word diff would misreport moves as edits. */}
          <div className="diff-col">
            <div className="diff-label">Original</div>
            <div className="diff-text">{editable ? <WordDiff a={c.original} b={c.proposed} side="a" /> : c.original}</div>
          </div>
          <div className="diff-col">
            <div className="diff-label">{editable ? "Proposed" : "New order"}</div>
            <div className="diff-text">{editable ? <WordDiff a={c.original} b={c.proposed} side="b" /> : c.proposed}</div>
          </div>
        </div>
      )}

      {!editing && hasBody && (
        <div className="change-body">
          {c.reason && (
            <div>
              <h4>Why this change</h4>
              <p>{c.reason}</p>
            </div>
          )}
          {f && f.supporting_evidence.length > 0 && (
            <div>
              <h4>Supported by these resume lines</h4>
              <div className="stack-sm">{f.supporting_evidence.map((s, k) => <blockquote key={k}>{s}</blockquote>)}</div>
            </div>
          )}
          {f && f.issues.length > 0 && (
            <div>
              <h4>Fact-check findings</h4>
              <ul className="issues">
                {f.issues.map((i, k) => (
                  <li key={k} className={i.hard ? "text-bad" : undefined}>{i.detail}</li>
                ))}
              </ul>
            </div>
          )}
          {f?.llm_explanation && <p className="muted">{f.llm_explanation}</p>}
        </div>
      )}

      {!editing && (
        <footer className="change-foot">
          <button
            className="btn btn-sm"
            disabled={disabled || unsupported || c.decision === "accepted"}
            title={unsupported ? "Edit the text to remove unsupported claims before accepting." : undefined}
            onClick={() => onDecide("accepted")}
          >
            Accept
          </button>
          <button className="btn btn-sm" disabled={disabled || c.decision === "rejected"} onClick={() => onDecide("rejected")}>
            Reject
          </button>
          {editable && (
            <button className="btn btn-sm btn-ghost" disabled={disabled} onClick={() => { setDraft(c.proposed); setEditing(true); }}>
              Edit
            </button>
          )}
          <span className="spacer" />
          {busy?.startsWith(c.id) ? <Spinner /> : unsupported && <span className="xs muted">Edit to remove unsupported claims before accepting.</span>}
        </footer>
      )}
    </article>
  );
}

/** Word-level diff via LCS. Side "a" marks removed words, side "b" marks added words. */
function WordDiff({ a, b, side }: { a: string; b: string; side: "a" | "b" }) {
  const parts = useMemo(() => diffWords(a, b), [a, b]);
  return (
    <>
      {parts
        .filter((p) => p.op === "eq" || (side === "a" ? p.op === "del" : p.op === "add"))
        .map((p, i) => (
          <span key={i} className={p.op === "del" ? "del" : p.op === "add" ? "add" : undefined}>
            {p.text}
          </span>
        ))}
    </>
  );
}

function diffWords(a: string, b: string): { op: "eq" | "add" | "del"; text: string }[] {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  if (A.length * B.length > 400_000) return [{ op: "del", text: a }, { op: "add", text: b }];
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { op: "eq" | "add" | "del"; text: string }[] = [];
  const push = (op: "eq" | "add" | "del", text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { push("eq", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", A[i++]);
    else push("add", B[j++]);
  }
  while (i < A.length) push("del", A[i++]);
  while (j < B.length) push("add", B[j++]);
  return out;
}
