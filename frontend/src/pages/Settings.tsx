import { Check, Languages, Moon, RotateCcw, Save } from "lucide-react";
import { useState } from "react";

import { WorkspaceShell } from "../components/WorkspaceShell";
import {
  DEFAULT_TRANSLATION_DEFAULTS,
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  clearTranslationDefaults,
  readTranslationDefaults,
  saveTranslationDefaults,
  type QualityMode,
  type TranslationDefaults,
} from "../lib/translationDefaults";
import type { ReadingDirection, ReplacementMode } from "../types/api";

interface SettingsState {
  defaults: TranslationDefaults;
  status: {
    tone: "idle" | "success" | "error";
    message: string;
  };
}

function loadSettingsState(): SettingsState {
  try {
    return {
      defaults: readTranslationDefaults(),
      status: {
        tone: "idle",
        message: "Ready",
      },
    };
  } catch {
    return {
      defaults: DEFAULT_TRANSLATION_DEFAULTS,
      status: {
        tone: "error",
        message: "Unable to load saved defaults. Built-in defaults are shown.",
      },
    };
  }
}

function statusClassName(tone: SettingsState["status"]["tone"]): string {
  if (tone === "success") {
    return "text-secondary";
  }
  if (tone === "error") {
    return "text-danger";
  }
  return "text-text-muted";
}

export function Settings() {
  const [{ defaults, status }, setSettingsState] = useState<SettingsState>(loadSettingsState);

  function updateDefaults(patch: Partial<TranslationDefaults>) {
    setSettingsState((current) => {
      const nextDefaults = { ...current.defaults, ...patch };
      const changed = (Object.keys(patch) as Array<keyof TranslationDefaults>).some(
        (key) => nextDefaults[key] !== current.defaults[key],
      );
      if (!changed) {
        return current;
      }

      return {
        defaults: nextDefaults,
        status: {
          tone: "idle",
          message: "Unsaved changes",
        },
      };
    });
  }

  function handleSave() {
    try {
      saveTranslationDefaults(defaults);
      setSettingsState((current) => ({
        ...current,
        status: {
          tone: "success",
          message: "Saved for new projects",
        },
      }));
    } catch {
      setSettingsState((current) => ({
        ...current,
        status: {
          tone: "error",
          message: "Unable to save defaults. Check browser storage permissions.",
        },
      }));
    }
  }

  function handleReset() {
    try {
      clearTranslationDefaults();
      setSettingsState({
        defaults: DEFAULT_TRANSLATION_DEFAULTS,
        status: {
          tone: "success",
          message: "Defaults reset",
        },
      });
    } catch {
      setSettingsState((current) => ({
        ...current,
        status: {
          tone: "error",
          message: "Unable to reset defaults. Check browser storage permissions.",
        },
      }));
    }
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">New project defaults</h1>
          <p className="mt-2 text-sm text-text-muted">
            These settings prefill future project setup screens. Existing projects keep their own saved settings.
          </p>
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
                <select
                  value={defaults.sourceLanguage}
                  onChange={(event) => updateDefaults({ sourceLanguage: event.target.value })}
                  className="mt-2 h-11 w-full rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary"
                >
                  {SOURCE_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Target language</span>
                <select
                  value={defaults.targetLanguage}
                  onChange={(event) => updateDefaults({ targetLanguage: event.target.value })}
                  className="mt-2 h-11 w-full rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary"
                >
                  {TARGET_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Tone</span>
                <select
                  value={defaults.tone}
                  onChange={(event) => updateDefaults({ tone: event.target.value })}
                  className="mt-2 h-11 w-full rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary"
                >
                  <option value="natural">Natural</option>
                  <option value="dramatic">Dramatic</option>
                  <option value="literal">Literal</option>
                  <option value="localized">Localized</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Replacement</span>
                <select
                  value={defaults.replacementMode}
                  onChange={(event) => updateDefaults({ replacementMode: event.target.value as ReplacementMode })}
                  className="mt-2 h-11 w-full rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary"
                >
                  <option value="replace">Replace</option>
                  <option value="overlay">Overlay</option>
                  <option value="bilingual">Bilingual</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Reading</span>
                <select
                  value={defaults.readingDirection}
                  onChange={(event) => updateDefaults({ readingDirection: event.target.value as ReadingDirection })}
                  className="mt-2 h-11 w-full rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary"
                >
                  <option value="rtl">Right to left</option>
                  <option value="ltr">Left to right</option>
                  <option value="ttb">Top to bottom</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-ink-border bg-surface-low p-5">
            <div className="mb-5 flex items-center gap-3">
              <Moon className="h-5 w-5 text-primary-soft" />
              <h2 className="font-display text-xl font-bold text-white">Processing</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-instrument border border-ink-border bg-background p-3">
                <span>
                  <span id="auto-process-label" className="block text-sm font-bold text-white">Auto-start processing</span>
                  <span id="auto-process-description" className="block text-xs text-text-muted">Begin OCR after upload setup is complete.</span>
                </span>
                <input
                  type="checkbox"
                  checked={defaults.autoStartProcessing}
                  onChange={(event) => updateDefaults({ autoStartProcessing: event.target.checked })}
                  className="h-5 w-5 rounded border-ink-border bg-surface text-primary focus:ring-primary"
                  aria-labelledby="auto-process-label"
                  aria-describedby="auto-process-description"
                />
              </div>
              <div className="flex items-center justify-between rounded-instrument border border-ink-border bg-background p-3">
                <span>
                  <span id="preserve-sfx-label" className="block text-sm font-bold text-white">Preserve SFX</span>
                  <span id="preserve-sfx-description" className="block text-xs text-text-muted">Flag sound effects separately for manual review.</span>
                </span>
                <input
                  type="checkbox"
                  checked={defaults.preserveSfx}
                  onChange={(event) => updateDefaults({ preserveSfx: event.target.checked })}
                  className="h-5 w-5 rounded border-ink-border bg-surface text-primary focus:ring-primary"
                  aria-labelledby="preserve-sfx-label"
                  aria-describedby="preserve-sfx-description"
                />
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(["balanced", "high"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateDefaults({ qualityMode: mode as QualityMode })}
                  aria-pressed={defaults.qualityMode === mode}
                  className={`flex items-center justify-between rounded-instrument border px-4 py-3 text-left text-sm font-bold capitalize transition ${
                    defaults.qualityMode === mode ? "border-secondary bg-secondary/10 text-white" : "border-ink-border bg-background text-text-muted hover:border-primary/50 hover:text-white"
                  }`}
                >
                  {mode} quality
                  {defaults.qualityMode === mode ? <Check className="h-4 w-4 text-secondary" /> : null}
                </button>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm font-semibold text-text-muted">
              Status: <span className={statusClassName(status.tone)}>{status.message}</span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center gap-2 rounded-instrument border border-ink-border px-4 py-3 text-sm font-bold text-text-main transition hover:bg-surface-high"
              >
                <RotateCcw className="h-4 w-4" />
                Reset defaults
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500"
              >
                <Save className="h-4 w-4" />
                Save settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
