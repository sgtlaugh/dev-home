export function formatLocalDate(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

export function getLocalDateString(timestamp?: string): string {
  return formatLocalDate(timestamp ? new Date(timestamp) : new Date());
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

export function getDateKey(timestamp: string, now?: number): string {
  const ref = now ?? Date.now();
  const actDate = new Date(timestamp);
  const todayDate = new Date(ref);

  const actDateOnly = new Date(actDate.getFullYear(), actDate.getMonth(), actDate.getDate());
  const todayDateOnly = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate(),
  );
  const yesterdayDateOnly = new Date(todayDateOnly);
  yesterdayDateOnly.setDate(yesterdayDateOnly.getDate() - 1);

  if (actDateOnly.getTime() === todayDateOnly.getTime()) {
    return "Today";
  } else if (actDateOnly.getTime() === yesterdayDateOnly.getTime()) {
    return "Yesterday";
  } else {
    return actDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}
