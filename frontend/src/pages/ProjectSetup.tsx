import { FormEvent, useEffect, useReducer } from "react";
import { ArrowLeft, Loader2, Play, UploadCloud } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { api, queryKeys } from "../api";
import { LockedLanguageSelect } from "../components/LockedLanguageSelect";
import { UploadDropzone } from "../components/UploadDropzone";
import { useUploadFlow } from "../lib/uploadFlow";
import type { ReadingDirection, ReplacementMode } from "../types/api";

interface ProjectSetupState {
  name: string;
  description: string;
  tone: string;
  replacementMode: ReplacementMode;
  readingDirection: ReadingDirection;
  preserveSfx: boolean;
  error: string | null;
  previewUrl?: string;
}

const initialProjectSetupState: ProjectSetupState = {
  name: "",
  description: "",
  tone: "natural",
  replacementMode: "replace",
  readingDirection: "rtl",
  preserveSfx: true,
  error: null,
};

function projectSetupReducer(state: ProjectSetupState, patch: Partial<ProjectSetupState>): ProjectSetupState {
  return { ...state, ...patch };
}

export function ProjectSetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pendingFiles, setPendingFiles, clearPendingFiles } = useUploadFlow();
  const [
    {
      name,
      description,
      tone,
      replacementMode,
      readingDirection,
      preserveSfx,
      error,
      previewUrl,
    },
    setProjectSetupState,
  ] = useReducer(projectSetupReducer, initialProjectSetupState);

  const runtimeLanguageQuery = useQuery({
    queryKey: queryKeys.runtimeLanguage,
    queryFn: () => api.getRuntimeLanguage(),
  });
  const runtimeLanguage = runtimeLanguageQuery.data;
  const sourceLanguage = runtimeLanguage?.source_language ?? "auto";
  const targetLanguage = runtimeLanguage?.target_language ?? "en";
  const lockMessage = runtimeLanguage?.lock_message ?? "Ask a system administrator to change the language.";
  const runtimeLanguageError = runtimeLanguageQuery.isError
    ? "Unable to load the configured translation language."
    : null;

  useEffect(() => {
    if (!name && pendingFiles[0]) {
      const baseName = pendingFiles[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setProjectSetupState({ name: baseName ? `${baseName} Translation` : "Untitled Translation" });
    }
  }, [name, pendingFiles]);

  useEffect(() => {
    const firstImage = pendingFiles.find((file) => file.type.startsWith("image/"));
    if (!firstImage) {
      setProjectSetupState({ previewUrl: undefined });
      return;
    }

    const objectUrl = URL.createObjectURL(firstImage);
    setProjectSetupState({ previewUrl: objectUrl });
    return () => {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    };
  }, [pendingFiles]);

  const startMutation = useMutation({
    mutationFn: async () => {
      if (pendingFiles.length === 0) {
        throw new Error("Upload at least one page before starting processing.");
      }
      if (!runtimeLanguage) {
        throw new Error("Runtime language is still loading.");
      }
      return api.createProject({
        name: name.trim() || "Untitled Translation",
        description: description.trim() || null,
        source_language: runtimeLanguage.source_language,
        target_language: runtimeLanguage.target_language,
        translation_tone: tone,
        replacement_mode: replacementMode,
        reading_direction: readingDirection,
      }).then((project) =>
        Promise.all([
          api.updateSettings(project.id, {
            source_language: sourceLanguage,
            target_language: targetLanguage,
            translation_tone: tone,
            replacement_mode: replacementMode,
            reading_direction: readingDirection,
            preserve_sfx: preserveSfx,
            bilingual: replacementMode === "bilingual",
            font_family: "Anime Ace",
          }),
          api.uploadPages(project.id, pendingFiles),
        ])
          .then(() => api.processProject(project.id, { force: false }))
          .then(() => project.id),
      );
    },
    onSuccess: async (projectId) => {
      clearPendingFiles();
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      navigate(`/projects/${projectId}/processing`);
    },
    onError: (mutationError) => {
      setProjectSetupState({ error: mutationError instanceof Error ? mutationError.message : "Unable to start processing." });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectSetupState({ error: null });
    startMutation.mutate();
  }

  return (
    <div className="min-h-screen bg-background text-text-main">
      <header className="sticky top-0 z-30 border-b border-ink-border bg-background/86 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white" aria-label="Back to upload">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-display text-xl font-bold text-white">New Project Setup</h1>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <section className="glass-panel rounded-lg p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase text-text-muted">Source Preview</h2>
            <span className="text-xs font-bold text-secondary">{pendingFiles.length} files selected</span>
          </div>
          {pendingFiles.length === 0 ? (
            <UploadDropzone onFiles={setPendingFiles} />
          ) : (
            <div className="flex min-h-[560px] items-center justify-center overflow-hidden rounded-lg border border-ink-border bg-background p-4">
              {previewUrl ? (
                <img className="max-h-[720px] max-w-full rounded-instrument object-contain shadow-2xl grayscale" src={previewUrl} alt="Selected source page preview" />
              ) : (
                <div className="flex flex-col items-center gap-4 text-text-muted">
                  <UploadCloud className="h-12 w-12 text-primary-soft" />
                  <p className="text-sm">Archive or PDF selected. A page preview will appear after processing.</p>
                </div>
              )}
            </div>
          )}
        </section>

        <form onSubmit={handleSubmit} className="glass-panel rounded-lg p-5">
          <h2 className="font-display text-2xl font-bold text-white">Translation settings</h2>
          <p className="mt-1 text-sm text-text-muted">Project style and processing defaults.</p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase text-text-muted">Project Name</span>
              <input value={name} onChange={(event) => setProjectSetupState({ name: event.target.value })} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-text-muted">Description</span>
              <textarea value={description} onChange={(event) => setProjectSetupState({ description: event.target.value })} rows={3} className="mt-2 w-full resize-none rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <LockedLanguageSelect isLoading={runtimeLanguageQuery.isLoading} label="Source" lockMessage={lockMessage} value={sourceLanguage} />
              <LockedLanguageSelect isLoading={runtimeLanguageQuery.isLoading} label="Target" lockMessage={lockMessage} value={targetLanguage} />
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-text-muted">Tone</span>
              <select value={tone} onChange={(event) => setProjectSetupState({ tone: event.target.value })} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary">
                <option value="natural">Natural</option>
                <option value="dramatic">Dramatic</option>
                <option value="literal">Literal</option>
                <option value="localized">Localized</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Replacement</span>
                <select value={replacementMode} onChange={(event) => setProjectSetupState({ replacementMode: event.target.value as ReplacementMode })} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary">
                  <option value="replace">Replace</option>
                  <option value="overlay">Overlay</option>
                  <option value="bilingual">Bilingual</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Reading</span>
                <select value={readingDirection} onChange={(event) => setProjectSetupState({ readingDirection: event.target.value as ReadingDirection })} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary">
                  <option value="rtl">Right to left</option>
                  <option value="ltr">Left to right</option>
                  <option value="ttb">Top to bottom</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-ink-border bg-background p-3">
              <span>
                <span id="preserve-sfx-label" className="block text-sm font-bold text-white">Preserve SFX</span>
                <span id="preserve-sfx-description" className="block text-xs text-text-muted">Flag sound effects separately for manual review.</span>
              </span>
              <input
                type="checkbox"
                checked={preserveSfx}
                onChange={(event) => setProjectSetupState({ preserveSfx: event.target.checked })}
                className="h-5 w-5 rounded border-ink-border bg-surface text-primary focus:ring-primary"
                aria-labelledby="preserve-sfx-label"
                aria-describedby="preserve-sfx-description"
              />
            </div>
          </div>

          {error || runtimeLanguageError ? (
            <p className="mt-4 rounded-instrument border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error ?? runtimeLanguageError}</p>
          ) : null}

          <button disabled={startMutation.isPending || pendingFiles.length === 0 || !runtimeLanguage} className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-6 py-4 text-base font-bold text-white shadow-glow transition hover:bg-violet-500 disabled:opacity-50">
            {startMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            Start AI Processing
          </button>
        </form>
      </main>
    </div>
  );
}
