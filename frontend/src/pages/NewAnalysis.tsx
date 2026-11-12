import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLoad } from "../hooks";
import { Card, ErrorBox, Spinner, Tabs } from "../components/ui";
import { ModelNotice } from "../components/models";
import type { JobSummary, ResumeSummary } from "../types";

type Source = "existing" | "new";
type JobInput = "paste" | "file";

export default function NewAnalysis() {
  const nav = useNavigate();
  const resumes = useLoad(() => api.listResumes(), []);
  const jobs = useLoad(() => api.listJobs(), []);

  const [resumeSrc, setResumeSrc] = useState<Source>("new");
  const [resumeId, setResumeId] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const [jobSrc, setJobSrc] = useState<Source>("new");
  const [jobId, setJobId] = useState("");
  const [jobInput, setJobInput] = useState<JobInput>("paste");
  const [jobText, setJobText] = useState("");
  const [jobFile, setJobFile] = useState<File | null>(null);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default to existing items once the library has loaded.
  const haveResumes = !!resumes.data?.length;
  const haveJobs = !!jobs.data?.length;

  const resumeReady = resumeSrc === "existing" ? !!resumeId : !!resumeFile;
  const jobReady =
    jobSrc === "existing" ? !!jobId : jobInput === "paste" ? jobText.trim().length > 0 : !!jobFile;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      let rid = resumeId;
      if (resumeSrc === "new") {
        setBusy("Parsing resume…");
        rid = (await api.uploadResume(resumeFile!)).id;
      }
      let jid = jobId;
      if (jobSrc === "new") {
        setBusy("Reading job description…");
        const job =
          jobInput === "paste"
            ? await api.createJob(jobText, company, title)
            : await api.uploadJob(jobFile!, company, title);
        jid = job.id;
      }
      setBusy("Starting analysis…");
      const match = await api.createMatch(rid, jid);
      nav(`/matches/${match.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>New analysis</h1>
          <ModelNotice />
        </div>
      </div>
      <form onSubmit={submit} className="stack">
        <Card title="1. Your resume">
          {haveResumes && (
            <Tabs<Source>
              tabs={[["new", "Upload new"], ["existing", "Use a saved resume"]]}
              value={resumeSrc}
              onChange={setResumeSrc}
            />
          )}
          {resumeSrc === "new" || !haveResumes ? (
            <FileDrop file={resumeFile} onFile={setResumeFile} accept=".pdf,.docx" hint="PDF or DOCX" />
          ) : (
            <Picker<ResumeSummary>
              items={resumes.data!}
              value={resumeId}
              onChange={setResumeId}
              label={(r) => `${r.filename}${r.candidate_name ? ` — ${r.candidate_name}` : ""}`}
            />
          )}
        </Card>

        <Card title="2. The job">
          {haveJobs && (
            <Tabs<Source>
              tabs={[["new", "Add new"], ["existing", "Use a saved job"]]}
              value={jobSrc}
              onChange={setJobSrc}
            />
          )}
          {jobSrc === "new" || !haveJobs ? (
            <>
              <div className="grid-2">
                <label className="field">
                  <span>Company (optional)</span>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Detected if left blank" />
                </label>
                <label className="field">
                  <span>Job title (optional)</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Detected if left blank" />
                </label>
              </div>
              <Tabs<JobInput>
                tabs={[["paste", "Paste text"], ["file", "Upload file"]]}
                value={jobInput}
                onChange={setJobInput}
              />
              {jobInput === "paste" ? (
                <label className="field">
                  <span className="sr-only">Job description</span>
                  <textarea
                    rows={12}
                    maxLength={20000}
                    value={jobText}
                    onChange={(e) => setJobText(e.target.value)}
                    placeholder="Paste the full job description, including requirements and responsibilities."
                  />
                  <span className="muted small right">{jobText.length.toLocaleString()} / 20,000</span>
                </label>
              ) : (
                <FileDrop file={jobFile} onFile={setJobFile} accept=".txt,.pdf,.docx,.md" hint="TXT, PDF or DOCX" />
              )}
            </>
          ) : (
            <Picker<JobSummary>
              items={jobs.data!}
              value={jobId}
              onChange={setJobId}
              label={(j) => `${j.title || "Untitled"}${j.company ? ` — ${j.company}` : ""} (${j.requirement_count} requirements)`}
            />
          )}
        </Card>

        <ErrorBox message={error} />
        <div className="form-actions">
          {busy ? (
            <Spinner label={busy} />
          ) : (
            <button type="submit" className="btn btn-primary btn-lg" disabled={!resumeReady || !jobReady}>
              Analyze fit
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Picker<T extends { id: string }>({ items, value, onChange, label }: {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  label: (t: T) => string;
}) {
  return (
    <label className="field">
      <span className="sr-only">Choose</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {label(it)}
          </option>
        ))}
      </select>
    </label>
  );
}

function FileDrop({ file, onFile, accept, hint }: {
  file: File | null;
  onFile: (f: File | null) => void;
  accept: string;
  hint: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`filedrop ${over ? "over" : ""} ${file ? "has-file" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {file ? (
        <>
          <strong>{file.name}</strong>
          <span className="muted small">{(file.size / 1024).toFixed(0)} KB · click to change</span>
        </>
      ) : (
        <>
          <strong>Drop a file here or click to browse</strong>
          <span className="muted small">{hint}</span>
        </>
      )}
    </label>
  );
}
