import { Check, Languages, Moon, Save } from "lucide-react";
import { useState } from "react";

import { WorkspaceShell } from "../components/WorkspaceShell";

export function Settings() {
  const [autoProcess, setAutoProcess] = useState(true);
  const [qualityMode, setQualityMode] = useState<"balanced" | "high">("balanced");
  const [status, setStatus] = useState("Unsaved");

  function handleSave() {
    setStatus("Saved locally");
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Settings</h1>
          <p className="mt-2 text-sm text-text-muted">Workspace defaults for translation and processing sessions.</p>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-ink-border bg-surface-low p-5">
            <div className="mb-5 flex items-center gap-3">
              <Languages className="h-5 w-5 text-primary-soft" />
              <h2 className="font-display text-xl font-bold text-white">Translation defaults</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Source language</span>
                <select className="mt-2 h-11 w-full rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary" defaultValue="ko">
                  <option value="ko">Korean</option>
                  <option value="ja">Japanese</option>
                  <option value="zh">Chinese</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Target language</span>
                <select className="mt-2 h-11 w-full rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary" defaultValue="en">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-ink-border bg-surface-low p-5">
            <div className="mb-5 flex items-center gap-3">
              <Moon className="h-5 w-5 text-primary-soft" />
              <h2 className="font-display text-xl font-bold text-white">Processing</h2>
            </div>
            <label className="flex items-center justify-between rounded-instrument border border-ink-border bg-background p-3">
              <span>
                <span className="block text-sm font-bold text-white">Auto-start processing</span>
                <span className="block text-xs text-text-muted">Begin OCR after upload setup is complete.</span>
              </span>
              <input type="checkbox" checked={autoProcess} onChange={(event) => setAutoProcess(event.target.checked)} className="h-5 w-5 rounded border-ink-border bg-surface text-primary focus:ring-primary" />
            </label>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(["balanced", "high"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setQualityMode(mode)}
                  className={`flex items-center justify-between rounded-instrument border px-4 py-3 text-left text-sm font-bold capitalize transition ${
                    qualityMode === mode ? "border-secondary bg-secondary/10 text-white" : "border-ink-border bg-background text-text-muted hover:border-primary/50 hover:text-white"
                  }`}
                >
                  {mode} quality
                  {qualityMode === mode ? <Check className="h-4 w-4 text-secondary" /> : null}
                </button>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-text-muted">Status: <span className="text-secondary">{status}</span></p>
            <button onClick={handleSave} className="inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
              <Save className="h-4 w-4" />
              Save settings
            </button>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
