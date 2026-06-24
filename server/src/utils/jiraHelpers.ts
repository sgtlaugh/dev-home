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

export const VELOCITY_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function calculateVelocityMetrics(
  issues: any[],
  startDate: string,
  endDate: string,
  spFieldId?: string | null,
): Record<string, any> {
  const completionTimes: number[] = [];
  const completionsByWeekMap = new Map<
    string,
    { count: number; storyPoints: number; issues: string[] }
  >();
  let totalStoryPoints = 0;

  for (const issue of issues) {
    const time = getCompletionTime(issue);
    completionTimes.push(time);
    const sp = spFieldId ? Number(issue.fields?.[spFieldId]) || 0 : 0;
    totalStoryPoints += sp;

    const weekKey = getWeekKey(new Date(issue.fields?.resolutiondate));
    const entry = completionsByWeekMap.get(weekKey) || { count: 0, storyPoints: 0, issues: [] };
    entry.count++;
    entry.storyPoints += sp;
    entry.issues.push(issue.key);
    completionsByWeekMap.set(weekKey, entry);
  }

  let allWeeks = generateWeekKeysInRange(startDate, endDate);
  if (allWeeks.length % 2 !== 0 && allWeeks.length > 1) {
    allWeeks = allWeeks.slice(1);
  }
  const completionsByWeek = allWeeks
    .sort((a, b) => b.localeCompare(a))
    .map((weekKey) => {
      const data = completionsByWeekMap.get(weekKey);
      return {
        weekRange: formatWeekRange(weekKey),
        count: data?.count || 0,
        storyPoints: data?.storyPoints || 0,
        issues: data?.issues || [],
      };
    });

  const sortedTimes = [...completionTimes].sort((a, b) => a - b);
  const mean =
    completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;
  const median = completionTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length / 2)] : 0;
  const fastest = sortedTimes.length > 0 ? sortedTimes[0] : 0;
  const slowest = sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0;

  const totalWeeks = completionsByWeek.length || 1;
  const tasksPerWeek = issues.length / totalWeeks;

  const currentWeekCount = completionsByWeek.length > 0 ? completionsByWeek[0].count : 0;
  const previousWeekCount = completionsByWeek.length > 1 ? completionsByWeek[1].count : 0;

  let trend: "improving" | "stable" | "declining" = "stable";
  let trendPercentage = 0;
  if (completionsByWeek.length >= 2) {
    const midpoint = Math.ceil(completionsByWeek.length / 2);
    const useSP = totalStoryPoints > 0;
    const metric = (w: { count: number; storyPoints: number }) => (useSP ? w.storyPoints : w.count);
    const recentHalf = completionsByWeek.slice(0, midpoint).reduce((sum, w) => sum + metric(w), 0);
    const olderHalf = completionsByWeek.slice(midpoint).reduce((sum, w) => sum + metric(w), 0);

    if (olderHalf > 0) {
      trendPercentage = ((recentHalf - olderHalf) / olderHalf) * 100;
      if (trendPercentage > 10) trend = "improving";
      else if (trendPercentage < -10) trend = "declining";
    }
  }

  const meanFormatted = formatCompletionTime(mean);
  const medianFormatted = formatCompletionTime(median);
  const fastestFormatted = formatCompletionTime(fastest);
  const slowestFormatted = formatCompletionTime(slowest);

  return {
    period: { startDate, endDate },
    totalCompleted: issues.length,
    totalStoryPoints,
    storyPointsPerWeek: Math.round((totalStoryPoints / totalWeeks) * 100) / 100,
    completionsByWeek,
    averageCompletionTime: {
      mean: meanFormatted.value,
      meanDays: Math.round(mean * 100) / 100,
      median: medianFormatted.value,
      medianDays: Math.round(median * 100) / 100,
      fastest: fastestFormatted.value,
      fastestDays: Math.round(fastest * 100) / 100,
      slowest: slowestFormatted.value,
      slowestDays: Math.round(slowest * 100) / 100,
    },
    velocity: {
      tasksPerWeek: Math.round(tasksPerWeek * 100) / 100,
      currentWeek: currentWeekCount,
      previousWeek: previousWeekCount,
      trend,
      trendPercentage: Math.round(trendPercentage * 100) / 100,
    },
  };
}
