import { useState, type ReactNode } from "react";
import type { Decision, Evidence, FactualityStatus, JobStatus, Severity, SupportLevel } from "../types";

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Turn a backend error into one plain sentence for the main UI: no URLs, ports or stack
 * traces. The raw text stays available behind a "Technical details" disclosure.
 */
export function friendlyError(raw: string | null | undefined, fallback = "Something went wrong.") {
  if (!raw) return fallback;
  const text = raw.trim();
  if (/traceback|exception:|\bat line\b/i.test(text)) return fallback;
  if (/can't reach|could not reach|connection refused|connecterror|unreachable/i.test(text))
    return "The model server couldn't be reached. Check Settings, then retry.";
  if (/timed? ?out/i.test(text)) return "The model took too long to respond. Retry, or choose a faster model in Settings.";
  if (/invalid structured output/i.test(text))
    return "The model returned an unusable answer. Retry, or choose a larger model in Settings.";
  if (/interrupted|restart/i.test(text)) return "This run was interrupted when the app restarted. Retry to run it again.";
  const cleaned = text
    .replace(/https?:\/\/\S+/g, "the server")
    .replace(/\b(localhost|127\.0\.0\.1)(:\d+)?\S*/g, "the server")
    .split(/(?<=[.!?])\s/)[0];
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="callout callout-error" role="alert">
      {message}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-row">
      <span className="spinner" aria-hidden />
      {label && <span>{label}</span>}
    </div>
  );
}

/** Bordered container. Use sparingly: most content sits directly on the page in sections. */
export function Card({ title, actions, children, className }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className ?? ""}`}>
      {(title || actions) && (
        <header className="panel-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Page section with a heading, optional description and actions. */
export function Section({ id, title, description, actions, children }: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section" id={id}>
      <header className="section-head">
        <div>
          <h2>{title}</h2>
          {description && <p className="section-desc">{description}</p>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export type Tone = "good" | "warn" | "bad" | "neutral" | "accent" | "open";

/** A small dot followed by text: the only status indicator in the app. */
export function Status({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className="status" title={title}>
      <span className={`dot dot-${tone}`} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** A number with a label, e.g. "72 /100  Overall fit". */
export function Metric({ value, suffix = "/100", label, hint }: {
  value: number | null | undefined;
  suffix?: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="metric" title={hint}>
      <div className="metric-value">
        {value == null ? "—" : Math.round(value)}
        {value != null && suffix && <span className="metric-suffix">{suffix}</span>}
      </div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

export const DECISION_TONE: Record<Decision, Tone> = {
  APPLY: "good",
  APPLY_TAILOR_FIRST: "good",
  BORDERLINE: "warn",
  PROBABLY_SKIP: "bad",
  NEEDS_CLARIFICATION: "accent",
};

/** Backend labels arrive in capitals ("APPLY — TAILOR FIRST"); show them in sentence case. */
export function sentenceCase(label: string) {
  if (label !== label.toUpperCase()) return label;
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function DecisionBadge({ decision, label }: { decision: Decision | null; label: string | null }) {
  if (!decision) return null;
  return <Status tone={DECISION_TONE[decision]}>{sentenceCase(label ?? decision)}</Status>;
}

const STATUS_TEXT: Record<JobStatus, [string, Tone]> = {
  pending: ["Queued", "neutral"],
  running: ["Running", "accent"],
  complete: ["Complete", "good"],
  failed: ["Failed", "bad"],
};

export function StatusPill({ status }: { status: JobStatus }) {
  const [label, tone] = STATUS_TEXT[status] ?? [status, "neutral"];
  return <Status tone={tone}>{label}</Status>;
}

const SEVERITY_TONE: Record<Severity, Tone> = { high: "bad", medium: "warn", low: "neutral" };
export function SeverityPill({ severity }: { severity: Severity }) {
  return <Status tone={SEVERITY_TONE[severity]}>{severity[0].toUpperCase() + severity.slice(1)}</Status>;
}

const SUPPORT_LABEL: Record<SupportLevel, [string, Tone]> = {
  confirmed: ["Confirmed", "good"],
  potentially_transferable: ["Transferable", "warn"],
  inferred: ["Inferred", "neutral"],
  not_demonstrated: ["Not shown", "open"],
};
export function SupportPill({ support }: { support: SupportLevel }) {
  const [label, tone] = SUPPORT_LABEL[support] ?? [support, "neutral"];
  return <Status tone={tone}>{label}</Status>;
}

export const FACT_LABEL: Record<FactualityStatus, [string, Tone]> = {
  SUPPORTED: ["Supported by resume", "good"],
  PARTIALLY_SUPPORTED: ["Partly supported", "warn"],
  UNSUPPORTED: ["Not supported", "bad"],
};
export function FactualityPill({ status }: { status: FactualityStatus }) {
  const [label, tone] = FACT_LABEL[status];
  return <Status tone={tone}>{label}</Status>;
}

/** Verbatim resume lines backing a judgment, collapsed by default. */
export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const [open, setOpen] = useState(false);
  if (!evidence.length) return null;
  return (
    <div className="evidence">
      <button className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide" : "Show"} evidence ({evidence.length})
      </button>
      {open && (
        <ul>
          {evidence.map((e, i) => (
            <li key={`${e.line_id}-${i}`}>
              <blockquote>{e.evidence}</blockquote>
              <div className="quote-meta">
                {e.source_section}
                {e.source_location && ` · ${e.source_location}`} · {e.strength}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange }: {
  tabs: [K, string][];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "active" : ""} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Compact segmented control for filters. */
export function Segmented<K extends string>({ options, value, onChange, label }: {
  options: [K, string][];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([k, text]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "active" : ""} onClick={() => onChange(k)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Raw error text, hidden by default, for when the plain message isn't enough. */
export function TechnicalDetails({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <details className="tech-details">
      <summary>Technical details</summary>
      <pre>{text}</pre>
    </details>
  );
}

/* Icons: 16px strokes, currentColor. */
const svg = (d: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
export const IconChevronRight = () => svg(<path d="M6 3.5 10.5 8 6 12.5" />);
export const IconChevronDown = () => svg(<path d="M3.5 6 8 10.5 12.5 6" />);
export const IconSearch = () => svg(<><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>);
