import { Check, KeyRound, UserRound } from "lucide-react";
import { useState } from "react";

import { WorkspaceShell } from "../components/WorkspaceShell";

export function Account() {
  const [displayName, setDisplayName] = useState("ComicFlow Operator");
  const [status, setStatus] = useState("Current");

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Account</h1>
          <p className="mt-2 text-sm text-text-muted">Profile and access controls for the local workspace.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-lg border border-ink-border bg-surface-low p-5">
            <div className="mb-5 flex items-center gap-3">
              <UserRound className="h-5 w-5 text-primary-soft" />
              <h2 className="font-display text-xl font-bold text-white">Profile</h2>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase text-text-muted">Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 h-11 w-full rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-main outline-none focus:border-secondary"
              />
            </label>
            <button onClick={() => setStatus("Profile saved")} className="mt-5 inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
              <Check className="h-4 w-4" />
              Save profile
            </button>
          </section>

          <aside className="rounded-lg border border-ink-border bg-surface-low p-5">
            <KeyRound className="mb-4 h-8 w-8 text-primary-soft" />
            <h2 className="font-display text-lg font-bold text-white">Access</h2>
            <p className="mt-2 text-sm text-text-muted">Signed in to the local development workspace.</p>
            <p className="mt-4 rounded-instrument border border-ink-border bg-background p-3 text-sm font-semibold text-secondary">{status}</p>
          </aside>
        </div>
      </div>
    </WorkspaceShell>
  );
}
