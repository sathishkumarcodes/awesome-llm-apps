import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLoad } from "../hooks";
import { useModels } from "./models";

/**
 * Shown on an analysis when its job was parsed without the model (e.g. Ollama was down):
 * requirement types, categories and inferred signals are then missing, so scores are rougher.
 * Offers to parse the job again and start a fresh analysis.
 */
export function JobParseNotice({ jobId, resumeId }: { jobId: string; resumeId: string }) {
  const nav = useNavigate();
  const { models } = useModels();
  const { data: job, setData } = useLoad(() => api.getJob(jobId), [jobId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reparsed, setReparsed] = useState(false);

  if (!job || (job.profile.llm_enriched && !reparsed)) return null;
  const reason = job.profile.warnings.find((w) => w.startsWith("AI job extraction unavailable"));

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (reparsed && job.profile.llm_enriched) {
    return (
      <div className="callout">
        <div>The job was parsed again ({job.requirement_count} requirements). Run a new analysis to use it.</div>
        <button
          className="btn btn-primary btn-sm"
          disabled={!!busy}
          onClick={() =>
            run("new", async () => {
              const m = await api.createMatch(resumeId, jobId);
              nav(`/matches/${m.id}`);
            })
          }
        >
          {busy === "new" ? "Starting…" : "Run new analysis"}
        </button>
        {error && <div className="text-bad small">{error}</div>}
      </div>
    );
  }
  return (
    <div className="callout callout-warn">
      <div>
        <strong>This job was read without AI</strong>, so requirement types and categories are rough and
        the scores below are less reliable.
        {reason && <span className="small"> ({reason.replace("AI job extraction unavailable: ", "")})</span>}
      </div>
      <button
        className="btn btn-sm"
        disabled={!!busy}
        onClick={() =>
          run("reparse", async () => {
            const j = await api.reparseJob(jobId);
            setData(j);
            setReparsed(true);
            if (!j.profile.llm_enriched) setError("Parsing with AI failed again. Check the model in Settings.");
          })
        }
      >
        {busy === "reparse" ? "Parsing…" : `Re-parse job${models ? ` with ${models.active.model}` : ""}`}
      </button>
      {error && <div className="text-bad small">{error}</div>}
    </div>
  );
}
