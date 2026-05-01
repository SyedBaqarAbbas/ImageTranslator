const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatRelative(value: string): string {
  const diffMs = new Date(value).getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDays) >= 1) {
    return relativeFormatter.format(diffDays, "day");
  }

  const diffHours = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHours) >= 1) {
    return relativeFormatter.format(diffHours, "hour");
  }

  const diffMinutes = Math.round(diffMs / 60_000);
  return relativeFormatter.format(diffMinutes, "minute");
}
