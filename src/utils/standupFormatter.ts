import { ActivityItem } from "../services/activity";

const TERMINAL_STATUSES = new Set([
  "done",
  "closed",
  "resolved",
  "complete",
  "released",
  "cancelled",
]);

const PR_ACTION_PRIORITY: Record<string, number> = {
  "Merged PR": 1,
  "Approved PR": 2,
  "Changes Requested": 3,
  "Commented on PR": 4,
};

export function formatStandupNotes(activities: ActivityItem[]): string {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = activities.filter((a) => a.timestamp >= cutoff);

  const mergedKeys = new Set<string>();
  const terminalTransitions: string[] = [];
  const mergedLines: string[] = [];
  const reviewLines: string[] = [];

  const bestPerPR = new Map<string, ActivityItem>();
  for (const a of recent) {
    const priority = PR_ACTION_PRIORITY[a.action];
    if (!priority) continue;
    const existing = bestPerPR.get(a.entityKey);
    if (!existing || priority < (PR_ACTION_PRIORITY[existing.action] ?? 99)) {
      bestPerPR.set(a.entityKey, a);
    }
  }

  for (const a of recent) {
    if (a.action === "Changed status") {
      const toStatus = a.metadata?.toStatus || "";
      if (TERMINAL_STATUSES.has(toStatus.toLowerCase())) {
        terminalTransitions.push(`- ${a.title} → ${toStatus}`);
      }
    }
  }

  for (const [key, a] of bestPerPR) {
    if (a.action === "Merged PR") {
      mergedKeys.add(key);
      mergedLines.push(`- Merged: ${a.title}`);
    }
  }

  for (const [key, a] of bestPerPR) {
    if (mergedKeys.has(key)) continue;
    const label =
      a.action === "Approved PR"
        ? "Approved"
        : a.action === "Changes Requested"
          ? "Reviewed"
          : "Reviewed";
    reviewLines.push(`- ${label}: ${a.title}`);
  }

  const lines = [...terminalTransitions, ...mergedLines, ...reviewLines];
  return lines.join("\n");
}

export function getStandupTitle(): string {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Standup - ${formatted}`;
}
