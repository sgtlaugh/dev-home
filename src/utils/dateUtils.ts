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

export function getLocalDateMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateString(d.toISOString());
}
