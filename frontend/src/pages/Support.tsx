import { LifeBuoy, Mail, MessageSquare } from "lucide-react";
import { useState } from "react";

import { WorkspaceShell } from "../components/WorkspaceShell";

export function Support() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Ready");

  function handleSubmit() {
    setStatus(message.trim() ? "Support request drafted" : "Add a message");
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Support</h1>
          <p className="mt-2 text-sm text-text-muted">Workspace assistance and support request drafting.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-lg border border-ink-border bg-surface-low p-5">
            <div className="mb-5 flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary-soft" />
              <h2 className="font-display text-xl font-bold text-white">Request</h2>
            </div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-36 w-full rounded-instrument border border-ink-border bg-background p-3 text-sm text-text-main outline-none focus:border-secondary"
              placeholder="Describe the issue..."
            />
            <button onClick={handleSubmit} className="mt-4 inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
              <LifeBuoy className="h-4 w-4" />
              Draft request
            </button>
          </section>

          <aside className="rounded-lg border border-ink-border bg-surface-low p-5">
            <Mail className="mb-4 h-8 w-8 text-primary-soft" />
            <h2 className="font-display text-lg font-bold text-white">Contact</h2>
            <a className="mt-3 block rounded-instrument border border-ink-border bg-background p-3 text-sm font-semibold text-primary-soft transition hover:bg-surface-high" href="mailto:support@comicflow.ai">
              support@comicflow.ai
            </a>
            <p className="mt-4 rounded-instrument border border-ink-border bg-background p-3 text-sm font-semibold text-secondary">{status}</p>
          </aside>
        </div>
      </div>
    </WorkspaceShell>
  );
}
