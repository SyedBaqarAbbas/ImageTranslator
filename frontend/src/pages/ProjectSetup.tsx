import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Play, UploadCloud } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { api, queryKeys } from "../api";
import { UploadDropzone } from "../components/UploadDropzone";
import { useUploadFlow } from "../lib/uploadFlow";
import type { ReadingDirection, ReplacementMode } from "../types/api";

export function ProjectSetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pendingFiles, setPendingFiles, clearPendingFiles } = useUploadFlow();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [tone, setTone] = useState("natural");
  const [replacementMode, setReplacementMode] = useState<ReplacementMode>("replace");
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>("rtl");
  const [preserveSfx, setPreserveSfx] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    const firstImage = pendingFiles.find((file) => file.type.startsWith("image/"));
    return firstImage ? URL.createObjectURL(firstImage) : undefined;
  }, [pendingFiles]);

  useEffect(() => {
    if (!name && pendingFiles[0]) {
      const baseName = pendingFiles[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setName(baseName ? `${baseName} Translation` : "Untitled Translation");
    }
  }, [name, pendingFiles]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const startMutation = useMutation({
    mutationFn: async () => {
      if (pendingFiles.length === 0) {
        throw new Error("Upload at least one page before starting processing.");
      }
      const project = await api.createProject({
        name: name.trim() || "Untitled Translation",
        description: description.trim() || null,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        translation_tone: tone,
        replacement_mode: replacementMode,
        reading_direction: readingDirection,
      });
      await api.updateSettings(project.id, {
        source_language: sourceLanguage,
        target_language: targetLanguage,
        translation_tone: tone,
        replacement_mode: replacementMode,
        reading_direction: readingDirection,
        preserve_sfx: preserveSfx,
        bilingual: replacementMode === "bilingual",
        font_family: "Anime Ace",
      });
      await api.uploadPages(project.id, pendingFiles);
      await api.processProject(project.id, { force: false });
      return project.id;
    },
    onSuccess: async (projectId) => {
      clearPendingFiles();
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      navigate(`/projects/${projectId}/processing`);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Unable to start processing.");
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
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
          <p className="mt-1 text-sm text-text-muted">These defaults can be changed later from the editor.</p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase text-text-muted">Project Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-text-muted">Description</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Source</span>
                <select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary">
                  <option value="auto">Auto detect</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="zh">Chinese</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Target</span>
                <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-text-muted">Tone</span>
              <select value={tone} onChange={(event) => setTone(event.target.value)} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary">
                <option value="natural">Natural</option>
                <option value="dramatic">Dramatic</option>
                <option value="literal">Literal</option>
                <option value="localized">Localized</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Replacement</span>
                <select value={replacementMode} onChange={(event) => setReplacementMode(event.target.value as ReplacementMode)} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary">
                  <option value="replace">Replace</option>
                  <option value="overlay">Overlay</option>
                  <option value="bilingual">Bilingual</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Reading</span>
                <select value={readingDirection} onChange={(event) => setReadingDirection(event.target.value as ReadingDirection)} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary">
                  <option value="rtl">Right to left</option>
                  <option value="ltr">Left to right</option>
                  <option value="ttb">Top to bottom</option>
                </select>
              </label>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-ink-border bg-background p-3">
              <span>
                <span className="block text-sm font-bold text-white">Preserve SFX</span>
                <span className="block text-xs text-text-muted">Flag sound effects separately for manual review.</span>
              </span>
              <input type="checkbox" checked={preserveSfx} onChange={(event) => setPreserveSfx(event.target.checked)} className="h-5 w-5 rounded border-ink-border bg-surface text-primary focus:ring-primary" />
            </label>
          </div>

          {error ? <p className="mt-4 rounded-instrument border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

          <button disabled={startMutation.isPending || pendingFiles.length === 0} className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-6 py-4 text-base font-bold text-white shadow-glow transition hover:bg-violet-500 disabled:opacity-50">
            {startMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            Start AI Processing
          </button>
        </form>
      </main>
    </div>
  );
}
