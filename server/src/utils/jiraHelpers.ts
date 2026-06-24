export function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split("T")[0];
}

export function generateWeekKeysInRange(startDateStr: string, endDateStr: string): string[] {
  const weeks: string[] = [];
  const [startY, startM, startD] = startDateStr.split("-").map(Number);
  const [endY, endM, endD] = endDateStr.split("-").map(Number);

  let current = new Date(Date.UTC(startY, startM - 1, startD));
  const end = new Date(Date.UTC(endY, endM - 1, endD));

  const day = current.getUTCDay();
  const diff = current.getUTCDate() - day + (day === 0 ? -6 : 1);
  current.setUTCDate(diff);

  while (current <= end) {
    weeks.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return weeks;
}

export function formatWeekRange(startDateStr: string): string {
  const [year, month, day] = startDateStr.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 6));
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
  return `${fmt(start)} - ${fmt(end)}`;
}

export function getCompletionTime(issue: any): number {
  const created = new Date(issue.fields?.created || new Date());
  const resolved = new Date(issue.fields?.resolutiondate || new Date());
  const days = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, days);
}

export function formatCompletionTime(days: number): { value: string; days: number } {
  if (days < 1) {
    const hours = Math.max(1, Math.ceil(days * 24));
    return { value: `${hours}h`, days };
  }
  const roundedDays = Math.ceil(days);
  return { value: `${roundedDays}d`, days };
}
