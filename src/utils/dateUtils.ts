export function getLocalDateString(timestamp?: string): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

export function formatLocalDate(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

export function formatLocalDateTime(date: Date): string {
  const dateStr = formatLocalDate(date);
  const timeStr =
    String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  return `${dateStr} ${timeStr}`;
}

export function getLocalDateMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateString(d.toISOString());
}
