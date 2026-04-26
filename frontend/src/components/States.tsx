import { AlertTriangle, Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center p-8 text-text-muted">
      <Loader2 className="mr-3 h-5 w-5 animate-spin text-secondary" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="m-6 flex min-h-[240px] items-center justify-center rounded-lg border border-danger/40 bg-danger/10 p-8 text-danger">
      <AlertTriangle className="mr-3 h-5 w-5" />
      {message}
    </div>
  );
}
