import { useId } from "react";

interface LockedLanguageSelectProps {
  label: string;
  value: string;
  lockMessage: string;
  isLoading?: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  auto: "Auto detect",
  ko: "Korean",
  kor: "Korean",
  ja: "Japanese",
  jpn: "Japanese",
  zh: "Chinese",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
};

function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language.toLowerCase()] ?? language.toUpperCase();
}

export function LockedLanguageSelect({ label, value, lockMessage, isLoading = false }: LockedLanguageSelectProps) {
  const tooltipId = useId();
  const displayValue = isLoading ? "loading" : value;
  const selectLabel = label.toLowerCase().includes("language") ? label : `${label} language`;

  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-text-muted">{label}</span>
      <span
        aria-describedby={tooltipId}
        className="group relative mt-2 block"
        tabIndex={0}
        title={lockMessage}
      >
        <select
          aria-label={selectLabel}
          className="h-11 w-full cursor-not-allowed rounded-instrument border border-ink-border bg-background px-3 text-sm text-text-muted opacity-80 outline-none"
          disabled
          onChange={() => undefined}
          value={displayValue}
        >
          <option value={displayValue}>{isLoading ? "Loading" : languageLabel(value)}</option>
        </select>
        <span
          className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden max-w-xs rounded-instrument border border-ink-border bg-surface-high px-3 py-2 text-xs font-semibold text-text-main shadow-2xl group-hover:block group-focus:block"
          id={tooltipId}
          role="tooltip"
        >
          {lockMessage}
        </span>
      </span>
    </label>
  );
}
