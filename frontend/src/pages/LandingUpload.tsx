import { ArrowRight, Download, Eye, Languages, ScanText, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { TopNav } from "../components/TopNav";
import { UploadDropzone } from "../components/UploadDropzone";
import { useUploadFlow } from "../lib/uploadFlow";

const workflow = [
  { title: "Upload", body: "Import raw scans or archives into a secure workspace.", icon: Upload, tone: "text-primary-soft" },
  { title: "Detect", body: "Map speech bubbles, captions, SFX, and reading order.", icon: ScanText, tone: "text-secondary" },
  { title: "Preview", body: "Inspect live translations with editable text regions.", icon: Eye, tone: "text-secondary" },
  { title: "Export", body: "Package final pages as ZIP or PDF exports.", icon: Download, tone: "text-tertiary" },
];

export function LandingUpload() {
  const navigate = useNavigate();
  const { setPendingFiles } = useUploadFlow();

  return (
    <div className="min-h-screen bg-background text-text-main">
      <TopNav />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 lg:px-8">
        <section className="flex flex-col items-center text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-instrument border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-xs font-bold uppercase text-secondary">
            <Languages className="h-4 w-4" />
            Manga translation darkroom
          </div>
          <h1 className="max-w-3xl font-display text-4xl font-black leading-tight text-white sm:text-5xl">
            Translate and typeset with precision
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-text-muted">
            Drop raw pages, configure the translation pass, review AI-detected regions, and export polished comic pages from one focused workspace.
          </p>
          <div className="mt-8 w-full">
            <UploadDropzone
              onFiles={(files) => {
                setPendingFiles(files);
                navigate("/projects/new");
              }}
            />
          </div>
        </section>

        <section>
          <div className="mb-6 flex items-center justify-center gap-4">
            <span className="h-px w-24 bg-ink-border" />
            <h2 className="text-xs font-bold uppercase text-secondary">Workflow Engine</h2>
            <span className="h-px w-24 bg-ink-border" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {workflow.map(({ title, body, icon: Icon, tone }, index) => (
              <article key={title} className="rounded-lg border border-ink-border bg-surface-low p-5 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-ink-border bg-surface-high">
                  <Icon className={`h-5 w-5 ${tone}`} />
                </div>
                <h3 className="font-display text-lg font-bold text-white">
                  {index + 1}. {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border border-ink-border bg-surface-low p-4 md:grid-cols-[1fr_auto] md:items-center md:p-6">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Already have projects?</h2>
            <p className="mt-1 text-sm text-text-muted">Open the dashboard to continue editing, review flagged regions, or export a completed workspace.</p>
          </div>
          <button
            onClick={() => navigate("/projects")}
            className="inline-flex items-center justify-center gap-2 rounded-instrument border border-primary/40 px-4 py-3 text-sm font-bold text-primary-soft transition hover:bg-primary/10"
          >
            Open dashboard
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      </main>
    </div>
  );
}
