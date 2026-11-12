import type {
  ChangeDecision,
  Health,
  ModelsResponse,
  EvaluationOut,
  ScorecardOut,
  JobDetail,
  JobSummary,
  MatchDetail,
  MatchSummary,
  ResumeDetail,
  ResumeSummary,
  TailoringMode,
  VersionDetail,
  VersionSummary,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError("Can't reach the backend. Is it running on port 8000?", 0);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<Health>("/health"),
  listModels: (refresh = false) => request<ModelsResponse>(`/llm/models${refresh ? "?refresh=true" : ""}`),
  setModel: (provider: string, model: string) =>
    request<ModelsResponse>("/llm/active", json("PUT", { provider, model })),

  listResumes: () => request<ResumeSummary[]>("/resumes"),
  getResume: (id: string) => request<ResumeDetail>(`/resumes/${id}`),
  uploadResume: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ResumeDetail>("/resumes", { method: "POST", body: fd });
  },
  resumeFileUrl: (id: string) => `${BASE}/resumes/${id}/file`,

  listJobs: () => request<JobSummary[]>("/jobs"),
  getJob: (id: string) => request<JobDetail>(`/jobs/${id}`),
  createJob: (description: string, company: string, title: string) =>
    request<JobDetail>("/jobs", json("POST", { description, company, title })),
  uploadJob: (file: File, company: string, title: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("company", company);
    fd.append("title", title);
    return request<JobDetail>("/jobs/upload", { method: "POST", body: fd });
  },

  reparseJob: (id: string) => request<JobDetail>(`/jobs/${id}/reparse`, { method: "POST" }),
  listMatches: () => request<MatchSummary[]>("/matches"),
  getMatch: (id: string) => request<MatchDetail>(`/matches/${id}`),
  rerunMatch: (id: string) => request<MatchDetail>(`/matches/${id}/rerun`, { method: "POST" }),
  createMatch: (resume_id: string, job_id: string) =>
    request<MatchDetail>("/matches", json("POST", { resume_id, job_id })),

  matchEvaluation: (matchId: string) => request<EvaluationOut>(`/matches/${matchId}/evaluation`),
  getEvaluation: (id: string) => request<EvaluationOut>(`/evaluations/${id}`),
  answerQuestion: (evalId: string, questionId: string, kind: "yes" | "no" | "detail", answer = "") =>
    request<EvaluationOut>(`/evaluations/${evalId}/clarifications`, json("POST", { question_id: questionId, kind, answer })),
  reevaluate: (evalId: string) => request<EvaluationOut>(`/evaluations/${evalId}/reevaluate`, { method: "POST" }),
  jobScorecard: (jobId: string) => request<ScorecardOut>(`/jobs/${jobId}/scorecard`),
  generateScorecard: (jobId: string) => request<ScorecardOut>(`/jobs/${jobId}/scorecard/generate`, { method: "POST" }),

  tailor: (resumeId: string, match_id: string, mode: TailoringMode) =>
    request<VersionDetail>(`/resumes/${resumeId}/tailor`, json("POST", { match_id, mode })),
  listVersions: () => request<VersionSummary[]>("/resume-versions"),
  getVersion: (id: string) => request<VersionDetail>(`/resume-versions/${id}`),
  rerunVersion: (id: string) => request<VersionDetail>(`/resume-versions/${id}/rerun`, { method: "POST" }),
  decideChange: (vid: string, cid: string, decision: ChangeDecision) =>
    request<VersionDetail>(`/resume-versions/${vid}/changes/${cid}`, json("PATCH", { decision })),
  editChange: (vid: string, cid: string, proposed: string) =>
    request<VersionDetail>(`/resume-versions/${vid}/changes/${cid}`, json("PATCH", { proposed })),
  validate: (vid: string, change_ids?: string[]) =>
    request<VersionDetail>(`/resume-versions/${vid}/validate`, json("POST", { change_ids: change_ids ?? null })),
  exportVersion: (vid: string, format: "original" | "pdf" | "docx") =>
    request<VersionDetail>(`/resume-versions/${vid}/export`, json("POST", { format })),
  downloadUrl: (vid: string) => `${BASE}/resume-versions/${vid}/download`,
  reportUrl: (vid: string) => `${BASE}/resume-versions/${vid}/report`,
};
