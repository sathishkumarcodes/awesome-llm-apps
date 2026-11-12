import { useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { useModels } from "./models";
import { TechnicalDetails, friendlyError } from "./ui";

/** Button that retries a failed job. Safe to place inside a link (it doesn't navigate). */
export function RerunButton({ onRerun, compact = false }: { onRerun: () => Promise<unknown>; compact?: boolean }) {
  const { models } = useModels();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function click(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      await onRerun();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  const model = models?.active.model;
  return (
    <span className="row">
      <button
        className={`btn ${compact ? "btn-sm" : ""}`}
        onClick={click}
        disabled={busy}
        title={model ? `Runs again with ${model}` : undefined}
      >
        {busy ? "Starting…" : "Retry"}
      </button>
      {error && <span className="text-bad xs">{error}</span>}
    </span>
  );
}

/** Error state for a failed job: a plain explanation, a retry action, raw details hidden. */
export function FailedBanner({ title, message, onRerun }: { title: string; message: string | null; onRerun: () => Promise<unknown> }) {
  const { models } = useModels();
  return (
    <div className="callout callout-error" role="alert">
      <div className="callout-title">{title}</div>
      <div>{friendlyError(message)}</div>
      <div className="callout-actions">
        <RerunButton onRerun={onRerun} />
        {models && (
          <span className="small muted">
            Retries with {models.active.model}. <Link to="/settings">Change model</Link>
          </span>
        )}
      </div>
      <TechnicalDetails text={message} />
    </div>
  );
}
