// Mirrors backend/app/schemas (api.py, analysis.py, tailoring.py, job.py, profile.py).

export type JobStatus = "pending" | "running" | "complete" | "failed";

export interface Health {
  status: string;
  llm: { provider: string; reachable: boolean; model: string; model_available?: boolean; local: boolean; error?: string };
  embedding_model: string;
  max_upload_mb: number;
}

// --- model selection -------------------------------------------------------
export interface ModelChoice {
  provider: string;
  model: string;
}
export interface ProviderModels {
  id: string;
  label: string;
  local: boolean;
  available: boolean;
  reason: string;
  models: { id: string; label: string }[];
}
export interface ModelsResponse {
  active: ModelChoice;
  providers: ProviderModels[];
}

// --- resumes ---------------------------------------------------------------
export interface SourceRef {
  line_id: string;
  document: string;
  section: string;
  company?: string | null;
  page?: number | null;
}
export interface Claim {
  claim: string;
  source: SourceRef;
}
export interface ExperienceEntry {
  company: string;
  title: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  dates_text: string;
  months: number | null;
  bullets: Claim[];
}
export interface CandidateProfile {
  candidate: {
    name: string;
    email: string;
    phone: string;
    location: string;
    links: string[];
    summary: string;
  };
  experience: ExperienceEntry[];
  skills: { name: string; source: SourceRef }[];
  education: { institution: string; degree: string; field: string; year: string }[];
  certifications: Claim[];
  total_experience_months: number | null;
  llm_enriched: boolean;
  warnings: string[];
}
export interface ResumeSummary {
  id: string;
  filename: string;
  file_type: string;
  candidate_name: string;
  roles: number;
  llm_enriched: boolean;
  version_count: number;
  created_at: string;
}
export interface ResumeDetail extends ResumeSummary {
  profile: CandidateProfile;
  prompt_version: string | null;
}

// --- jobs ------------------------------------------------------------------
export type RequirementKind = "must_have" | "preferred" | "responsibility" | "nice_to_have";
export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
  category: string;
  years: number | null;
  skills: string[];
}
export interface JobProfile {
  company: string;
  title: string;
  department: string;
  location: string;
  work_mode: string;
  seniority: string;
  seniority_level: string;
  min_years: number | null;
  education: string[];
  certifications: string[];
  requirements: Requirement[];
  inferred_signals: { signal: string; rationale: string }[];
  llm_enriched: boolean;
  warnings: string[];
}
export interface JobSummary {
  id: string;
  company: string;
  title: string;
  created_at: string;
  requirement_count: number;
}
export interface JobDetail extends JobSummary {
  description: string;
  profile: JobProfile;
  prompt_version: string | null;
}

// --- matches ---------------------------------------------------------------
export type SupportLevel = "confirmed" | "potentially_transferable" | "inferred" | "not_demonstrated";
export type Severity = "high" | "medium" | "low";
export type Decision = "APPLY" | "APPLY_TAILOR_FIRST" | "BORDERLINE" | "PROBABLY_SKIP" | "NEEDS_CLARIFICATION";

export interface Evidence {
  claim: string;
  evidence: string;
  line_id: string;
  source_section: string;
  source_location: string;
  strength: "strong" | "moderate" | "weak";
}
export interface Insight {
  title: string;
  detail: string;
  support: SupportLevel;
  evidence: Evidence[];
}
export interface Risk {
  title: string;
  detail: string;
  severity: Severity;
  evidence: Evidence[];
}
export interface RequirementAssessment {
  requirement_id: string;
  text: string;
  kind: string;
  category: string;
  status: "demonstrated" | "partial" | "not_demonstrated";
  support: SupportLevel;
  rationale: string;
  evidence: Evidence[];
  semantic_score: number;
}
export interface CategoryScore {
  key: string;
  label: string;
  weight: number;
  rating: number;
  points: number;
  rationale: string;
  evidence: Evidence[];
}
export interface EvaluatorResult {
  role: "recruiter" | "hiring_manager";
  question: string;
  score: number;
  headline: string;
  categories: CategoryScore[];
  strengths: Insight[];
  risks: Risk[];
  missing_requirements: string[];
  resume_concerns: Risk[];
  trajectory_concerns: Risk[];
  seniority_concerns: Risk[];
}
export interface MatchResult {
  recommendation: {
    decision: Decision;
    label: string;
    headline: string;
    why: string;
    deciding_factors: string[];
  };
  overall_score: number;
  recruiter: EvaluatorResult;
  hiring_manager: EvaluatorResult;
  requirements: RequirementAssessment[];
  why_match: Insight[];
  rejection_risks: Risk[];
  hiring_manager_concerns: Risk[];
  improvements: { action: string; rationale: string; impact: Severity; evidence: Evidence[] }[];
  seniority: {
    role_level: string;
    title_level: string;
    demonstrated_low: string;
    demonstrated_high: string;
    explanation: string;
    dimensions: { dimension: string; level: string; note: string; evidence: Evidence[] }[];
  };
  inferred_signals: RequirementAssessment[];
  gaps: string[];
  logistics?: string[];
  top_issue: string;
  disclaimer: string;
}
export interface MatchSummary {
  id: string;
  resume_id: string;
  job_id: string;
  status: JobStatus;
  progress: string;
  error: string | null;
  recruiter_score: number | null;
  hiring_manager_score: number | null;
  overall_score: number | null;
  recommendation: Decision | null;
  recommendation_label: string | null;
  top_issue: string;
  job_title: string;
  company: string;
  resume_filename: string;
  created_at: string;
}
export interface MatchDetail extends MatchSummary {
  result: MatchResult | null;
  model_name: string | null;
}

// --- tailoring -------------------------------------------------------------
export type TailoringMode = "minimal" | "recommended" | "aggressive";
export type FactualityStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED";
export type ChangeDecision = "accepted" | "rejected" | "pending";

export interface FactualityResult {
  status: FactualityStatus;
  issues: { kind: string; detail: string; hard: boolean }[];
  deterministic_status: FactualityStatus;
  llm_status: FactualityStatus | null;
  llm_explanation: string;
  supporting_evidence: string[];
}
export interface Change {
  id: string;
  type: "rewrite" | "summary" | "reorder" | "skills";
  section: string;
  target_line_ids: string[];
  original: string;
  proposed: string;
  reason: string;
  factuality: FactualityResult | null;
  decision: ChangeDecision;
  user_edited: boolean;
  target_criterion_ids?: string[];
  requires_user_review?: boolean;
}
export interface FactualityReport {
  supported: number;
  partially_supported: number;
  unsupported: number;
  accepted: number;
  pending: number;
  rejected: number;
  total: number;
}
export interface VersionSummary {
  id: string;
  name: string;
  original_resume_id: string;
  original_filename: string;
  file_type: string;
  job_id: string;
  match_id: string | null;
  job_title: string;
  company: string;
  tailoring_mode: TailoringMode;
  status: JobStatus;
  progress: string;
  error: string | null;
  factuality_report: FactualityReport | null;
  exported: boolean;
  created_at: string;
}
export interface VersionDetail extends VersionSummary {
  changes: Change[];
  export_notes: string[] | null;
}

// --- hiring scorecard (backend/app/scorecards/schemas.py) -----------------------------------
export type Importance = "critical" | "high" | "medium" | "low";
export type Owner = "recruiter" | "hiring_manager" | "both";
export type Level = "5" | "4" | "3" | "2" | "1" | "0" | "unknown";
export type Classification =
  | "directly_demonstrated"
  | "strong_equivalent"
  | "transferable"
  | "weakly_demonstrated"
  | "not_demonstrated"
  | "confirmed_absent"
  | "unknown";
export type GapType = "none" | "qualification" | "evidence" | "positioning" | "ats";
export type ScorecardDecision = Decision | "NEEDS_CLARIFICATION";

export interface Rubric {
  level_5: string;
  level_4: string;
  level_3: string;
  level_2: string;
  level_1: string;
  level_0: string;
  unknown: string;
}
export interface HiringCriterion {
  id: string;
  name: string;
  description: string;
  category: string;
  source_requirement_ids: string[];
  source_requirement_texts: string[];
  source_rule_ids: string[];
  importance: Importance;
  evaluation_owner: Owner;
  weight: number;
  recruiter_guidance: string;
  hiring_manager_guidance: string;
  rubric: Rubric;
  is_explicit: boolean;
  is_hard_requirement: boolean;
  rationale: string;
}
export interface EligibilityConstraint {
  id: string;
  requirement_id: string;
  text: string;
  is_hard_requirement: boolean;
}
export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
  fixed: boolean;
}
export interface ScorecardContent {
  role_family: string;
  seniority: string;
  summary: string;
  criteria: HiringCriterion[];
  eligibility: EligibilityConstraint[];
  validation: ValidationCheck[];
  generated_by: "model" | "deterministic";
}
export interface ScorecardOut {
  id: string;
  job_id: string;
  version: number;
  status: JobStatus;
  progress: string;
  error: string | null;
  content: ScorecardContent | null;
  model_name: string | null;
  created_at: string;
}
export interface CriterionEvidence {
  line_id: string;
  source: "resume" | "clarification";
  source_section: string;
  source_location: string;
  original_text: string;
  evidence_strength: "strong" | "moderate" | "weak";
}
export interface CriterionResult {
  criterion_id: string;
  classification: Classification;
  level: Level;
  recruiter_level: Level | null;
  hiring_manager_level: Level | null;
  match_type: string;
  evidence: CriterionEvidence[];
  gaps: string[];
  reasoning: string;
  recruiter_note: string;
  hiring_manager_note: string;
  recruiter_adjustments: string[];
  gap_type: GapType;
  improvement: string;
  tailoring_can_fix: boolean;
  clarification_question: string;
  used_clarification: boolean;
  clarified_level: Level | null;
  rule_results: Record<string, string>;
}
export interface Blocker {
  criterion_id: string | null;
  constraint_id: string | null;
  requirement_text: string;
  candidate_evidence: string;
  explanation: string;
}
export interface ClarificationQuestion {
  id: string;
  criterion_id: string | null;
  constraint_id: string | null;
  question: string;
  why: string;
  answer: string | null;
}
export interface ImprovementItem {
  criterion_id: string;
  criterion_name: string;
  weight: number;
  gap_type: GapType;
  summary: string;
  action: string;
  tailoring_can_fix: boolean;
}
export interface RuleOutcome {
  rule_id: string;
  name: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
}
export interface EvaluationContent {
  results: CriterionResult[];
  scores: {
    overall_fit: number | null;
    recruiter: number | null;
    hiring_manager: number | null;
    ats_readiness: number;
    evidence_completeness: number;
    provisional: boolean;
    fit_with_clarifications: number | null;
  };
  recommendation: { decision: ScorecardDecision; label: string; headline: string; why: string[] };
  blockers: Blocker[];
  clarifications: ClarificationQuestion[];
  improvements: ImprovementItem[];
  diagnostics: RuleOutcome[];
}
export interface EvaluationOut {
  id: string;
  scorecard_id: string;
  resume_id: string;
  match_id: string | null;
  status: JobStatus;
  progress: string;
  error: string | null;
  content: EvaluationContent | null;
  scorecard: ScorecardOut;
  model_name: string | null;
  created_at: string;
}
