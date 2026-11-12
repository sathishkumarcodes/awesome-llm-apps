import { createContext, useContext, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { useLoad } from "../hooks";
import { ErrorBox, Section, Status } from "./ui";
import type { Health, ModelsResponse, ProviderModels } from "../types";

interface ModelState {
  models: ModelsResponse | undefined;
  health: Health | undefined;
  healthError: string | null;
  /** The active provider's metadata (label, local). */
  activeProvider: ProviderModels | undefined;
  select: (provider: string, model: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ModelState | null>(null);

export function useModels(): ModelState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useModels must be used inside <ModelProvider>");
  return v;
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const models = useLoad(() => api.listModels(), []);
  const health = useLoad(() => api.health(), []);

  const select = async (provider: string, model: string) => {
    models.setData(await api.setModel(provider, model));
    health.reload();
  };
  const refresh = async () => {
    models.setData(await api.listModels(true));
    health.reload();
  };
  const activeProvider = models.data?.providers.find((p) => p.id === models.data?.active.provider);

  return (
    <Ctx.Provider
      value={{ models: models.data, health: health.data, healthError: health.error, activeProvider, select, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** Plain-language state of the backend and the active model. */
function useModelStatus(): { tone: "good" | "warn" | "bad" | "neutral"; text: string } {
  const { health, healthError, activeProvider } = useModels();
  if (healthError) return { tone: "bad", text: "The app's backend isn't responding." };
  const llm = health?.llm;
  if (!llm) return { tone: "neutral", text: "Checking…" };
  if (!llm.reachable) return { tone: "warn", text: `${activeProvider?.label ?? "The model provider"} can't be reached.` };
  if (llm.model_available === false) return { tone: "warn", text: `${llm.model} isn't installed. Run: ollama pull ${llm.model}` };
  return { tone: "good", text: "Ready" };
}

/** Discreet top-bar link to Settings. Shows a dot only when something needs attention. */
export function SettingsLink() {
  const status = useModelStatus();
  const attention = status.tone === "bad" || status.tone === "warn";
  return (
    <NavLink to="/settings" className="settings-link" title={attention ? status.text : "Settings"}>
      {attention && <span className={`dot dot-${status.tone}`} aria-hidden />}
      Settings
      {attention && <span className="sr-only"> — {status.text}</span>}
    </NavLink>
  );
}

/** Settings page section: choose the model that analyses run on. */
export function ModelSettings() {
  const { models, health, activeProvider, select, refresh } = useModels();
  const status = useModelStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const active = models?.active;
  return (
    <Section
      title="Model"
      description="The language model that reads resumes and job descriptions. Scores and weights are computed by the app, not the model."
      actions={
        <button className="btn btn-sm" onClick={() => run(refresh)} disabled={busy}>
          {busy ? "Checking…" : "Check again"}
        </button>
      }
    >
      <div className="panel">
        <div className="row small">
          <Status tone={status.tone}>{status.text}</Status>
          {active && status.tone === "good" && (
            <span className="muted">
              · {activeProvider?.label} · {active.model}
            </span>
          )}
        </div>
        {health?.llm.error && <p className="small muted mt-2">{health.llm.error}</p>}
      </div>
      <ErrorBox message={error} />
      {models?.providers.map((p) => (
        <div key={p.id} className="provider">
          <div className="provider-head">
            <h3>{p.label}</h3>
            <span className="provider-note">
              {p.local ? "Runs on this computer. Nothing leaves it." : "Resume and job text are sent to this provider."}
            </span>
          </div>
          {!p.available ? (
            <p className="small muted">{p.reason || "Unavailable."}</p>
          ) : (
            <div className="choice-list" role="radiogroup" aria-label={p.label}>
              {p.models.map((m) => {
                const checked = active?.provider === p.id && active.model === m.id;
                return (
                  <label key={m.id} className={`choice ${checked ? "checked" : ""}`}>
                    <input
                      type="radio"
                      name="model"
                      checked={checked}
                      disabled={busy}
                      onChange={() => run(() => select(p.id, m.id))}
                    />
                    <div>
                      <div className="choice-title">{m.label}</div>
                      {m.label !== m.id && <div className="choice-desc">{m.id}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <p className="small muted">
        Analyses already running keep the model they started with. To enable Claude or OpenAI, add the API key to the
        backend's <code>.env</code> file and restart it.
      </p>
    </Section>
  );
}

const VENDOR: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI" };

/** One-line privacy note for pages that send resume text to the model. */
export function ModelNotice() {
  const { models, activeProvider } = useModels();
  if (!models || !activeProvider) return null;
  if (activeProvider.local) {
    return (
      <p className="sub">
        Runs on this computer with {models.active.model}. Your resume doesn't leave this machine.
      </p>
    );
  }
  const vendor = VENDOR[activeProvider.id] ?? activeProvider.label;
  return (
    <p className="sub">
      Uses {models.active.model}. Your resume and the job text will be sent to {vendor}.
    </p>
  );
}
