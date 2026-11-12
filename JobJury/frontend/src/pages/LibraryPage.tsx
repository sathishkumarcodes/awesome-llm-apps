import { useState } from "react";
import { api } from "../api";
import { isRunning, useLoad } from "../hooks";
import { Card, Empty, ErrorBox, Spinner, formatDate } from "../components/ui";

export default function LibraryPage() {
  const resumes = useLoad(() => api.listResumes(), []);
  const jobs = useLoad(() => api.listJobs(), []);
  const [openResume, setOpenResume] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<string | null>(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <p className="sub">Resumes and job descriptions you’ve added, and what was extracted from them.</p>
        </div>
      </div>
      <div className="grid-2 align-start">
        <Card title="Resumes">
          <ErrorBox message={resumes.error} />
          {resumes.loading ? <Spinner /> : !resumes.data?.length ? <Empty>No resumes yet.</Empty> : (
            <ul className="items">
              {resumes.data.map((r) => (
                <li key={r.id}>
                  <button className="row-btn" onClick={() => setOpenResume(openResume === r.id ? null : r.id)}>
                    <strong>{r.filename}</strong>
                    <span className="muted small">
                      {r.candidate_name || "Unnamed"} · {r.roles} roles · {r.version_count} tailored · {formatDate(r.created_at)}
                    </span>
                  </button>
                  {openResume === r.id && <ResumeDetailView id={r.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Jobs">
          <ErrorBox message={jobs.error} />
          {jobs.loading ? <Spinner /> : !jobs.data?.length ? <Empty>No jobs yet.</Empty> : (
            <ul className="items">
              {jobs.data.map((j) => (
                <li key={j.id}>
                  <button className="row-btn" onClick={() => setOpenJob(openJob === j.id ? null : j.id)}>
                    <strong>{j.title || "Untitled"}{j.company && ` · ${j.company}`}</strong>
                    <span className="muted small">{j.requirement_count} requirements · {formatDate(j.created_at)}</span>
                  </button>
                  {openJob === j.id && <JobDetailView id={j.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ResumeDetailView({ id }: { id: string }) {
  const { data, error, loading } = useLoad(() => api.getResume(id), [id]);
  if (loading) return <Spinner />;
  if (!data) return <ErrorBox message={error} />;
  const p = data.profile;
  const years = p.total_experience_months != null ? (p.total_experience_months / 12).toFixed(1) : null;
  return (
    <div className="detail">
      {p.warnings.length > 0 && <ul className="notes">{p.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {years && <p className="small">{years} years of experience detected.</p>}
      {p.experience.map((e, i) => (
        <div key={i} className="small">
          <strong>{e.title}</strong> · {e.company} <span className="muted">{e.dates_text}</span>
        </div>
      ))}
      {p.skills.length > 0 && (
        <div className="chips">{p.skills.map((s, i) => <span key={i} className="tag">{s.name}</span>)}</div>
      )}
      <a className="link-btn" href={api.resumeFileUrl(id)}>Download original</a>
    </div>
  );
}

function JobDetailView({ id }: { id: string }) {
  const { data, error, loading, setData } = useLoad(() => api.getJob(id), [id]);
  const [busy, setBusy] = useState(false);
  const [reparseError, setReparseError] = useState<string | null>(null);
  if (loading) return <Spinner />;
  if (!data) return <ErrorBox message={error} />;
  const p = data.profile;
  const meta = [p.seniority_level || p.seniority, p.location, p.work_mode !== "unknown" ? p.work_mode : "", p.min_years ? `${p.min_years}+ yrs` : ""].filter(Boolean);
  return (
    <div className="detail">
      {meta.length > 0 && <p className="small muted">{meta.join(" · ")}</p>}
      {p.warnings.length > 0 && <ul className="notes">{p.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {!p.llm_enriched && (
        <div className="row">
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setReparseError(null);
              try {
                setData(await api.reparseJob(id));
              } catch (e) {
                setReparseError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Parsing…" : "Re-parse with AI"}
          </button>
          {reparseError && <span className="text-bad small">{reparseError}</span>}
        </div>
      )}
      <ul className="plain small">
        {p.requirements.map((r) => (
          <li key={r.id}><span className="tag">{r.kind.replace(/_/g, " ")}</span> {r.text}</li>
        ))}
      </ul>
      <ScorecardPanel jobId={id} />
    </div>
  );
}

function ScorecardPanel({ jobId }: { jobId: string }) {
  const { data: sc, error, reload, setData } = useLoad(() => api.jobScorecard(jobId), [jobId], isRunning, 2000);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const content = sc?.content;

  async function regenerate() {
    setBusy(true);
    setGenError(null);
    try {
      setData(await api.generateScorecard(jobId));
      reload();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scorecard-panel">
      <div className="row">
        <strong className="small">Hiring scorecard</strong>
        {sc && <span className="muted small">v{sc.version} · {sc.status}{content ? ` · ${content.generated_by === "model" ? sc.model_name : "built without AI"}` : ""}</span>}
        <button className="btn btn-sm" onClick={regenerate} disabled={busy || (sc ? isRunning(sc) : false)}>
          {sc ? "Regenerate" : "Generate"}
        </button>
      </div>
      {sc && isRunning(sc) && <Spinner label={sc.progress} />}
      {!sc && error && <p className="muted small">No scorecard yet. One is created on the first analysis, or generate it now.</p>}
      {genError && <div className="text-bad small">{genError}</div>}
      {sc?.status === "failed" && <div className="text-bad small">{sc.error}</div>}
      {content && (
        <>
          <ul className="plain small">
            {content.criteria.map((c) => (
              <li key={c.id}>
                <strong>{c.weight}%</strong> {c.name}{" "}
                <span className="muted">· {c.importance} · {c.evaluation_owner.replace("_", " ")}{c.is_explicit ? "" : " · inferred"}{c.is_hard_requirement ? " · required" : ""}</span>
              </li>
            ))}
          </ul>
          {content.eligibility.length > 0 && (
            <p className="muted small">Not scored (confirm yourself): {content.eligibility.map((e) => e.text).join(" · ")}</p>
          )}
        </>
      )}
    </div>
  );
}
