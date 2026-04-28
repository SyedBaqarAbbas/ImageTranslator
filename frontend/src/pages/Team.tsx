import { Copy, MailPlus, UserPlus } from "lucide-react";
import { useState } from "react";

import { WorkspaceShell } from "../components/WorkspaceShell";

export function Team() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Ready");
  const inviteLink = `${window.location.origin}/team`;

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setStatus("Invite link copied");
    } catch {
      setStatus("Invite link ready");
    }
  }

  function handleInvite() {
    setStatus(email.trim() ? `Invite drafted for ${email.trim()}` : "Enter an email address");
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Team</h1>
          <p className="mt-2 text-sm text-text-muted">Manage collaborators for this ComicFlow workspace.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-lg border border-ink-border bg-surface-low p-5">
            <h2 className="font-display text-xl font-bold text-white">Invite collaborator</h2>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 flex-1 rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary"
                placeholder="teammate@example.com"
                type="email"
              />
              <button onClick={handleInvite} className="inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
                <MailPlus className="h-4 w-4" />
                Draft invite
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-instrument border border-ink-border bg-background p-3 sm:flex-row sm:items-center">
              <input readOnly value={inviteLink} className="min-w-0 flex-1 bg-transparent text-sm text-text-muted outline-none" onFocus={(event) => event.target.select()} />
              <button onClick={copyInviteLink} className="inline-flex items-center justify-center gap-2 rounded-instrument border border-ink-border px-3 py-2 text-sm font-bold text-text-main transition hover:bg-surface-high">
                <Copy className="h-4 w-4" />
                Copy link
              </button>
            </div>
          </section>

          <aside className="rounded-lg border border-ink-border bg-surface-low p-5">
            <UserPlus className="mb-4 h-8 w-8 text-primary-soft" />
            <h2 className="font-display text-lg font-bold text-white">Team status</h2>
            <p className="mt-2 rounded-instrument border border-ink-border bg-background p-3 text-sm font-semibold text-secondary">{status}</p>
          </aside>
        </div>
      </div>
    </WorkspaceShell>
  );
}
