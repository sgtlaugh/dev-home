import { ActivityItem } from "../services/activity";

const TERMINAL_STATUSES = new Set([
  "done",
  "closed",
  "resolved",
  "complete",
  "released",
  "cancelled",
]);

export function formatStandupNotes(activities: ActivityItem[]): string {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = activities.filter((a) => a.timestamp >= cutoff);

  const ownPRs = new Set<string>();
  for (const a of activities) {
    if (a.action === "Created PR") ownPRs.add(a.entityKey);
  }

  const prActions = new Map<string, Set<string>>();
  const prTitles = new Map<string, string>();
  for (const a of recent) {
    if (
      ["Created PR", "Merged PR", "Approved PR", "Changes Requested", "Commented on PR"].includes(
        a.action,
      )
    ) {
      if (!prActions.has(a.entityKey)) prActions.set(a.entityKey, new Set());
      prActions.get(a.entityKey)!.add(a.action);
      prTitles.set(a.entityKey, a.title);
    }
  }

  const terminalTransitions: string[] = [];
  const createdLines: string[] = [];
  const mergedLines: string[] = [];
  const reviewLines: string[] = [];

  for (const a of recent) {
    if (a.action === "Changed status") {
      const toStatus = a.metadata?.toStatus || "";
      if (TERMINAL_STATUSES.has(toStatus.toLowerCase())) {
        terminalTransitions.push(`- ${a.title} → ${toStatus}`);
      }
    }
  }

  for (const [key, actions] of prActions) {
    const title = prTitles.get(key)!;
    const isOwn = ownPRs.has(key);

    if (isOwn) {
      // Own PR: show Created (takes priority), or Merged if not created in window
      if (actions.has("Created PR")) {
        const suffix = actions.has("Merged PR") ? " (Merged)" : "";
        createdLines.push(`- Created: ${title}${suffix}`);
      } else if (actions.has("Merged PR")) {
        mergedLines.push(`- Merged: ${title}`);
      }
    } else {
      // Others' PR: Merged > Approved > Changes Requested > Commented
      if (actions.has("Merged PR")) {
        mergedLines.push(`- Merged: ${title}`);
      } else if (actions.has("Approved PR")) {
        reviewLines.push(`- Approved: ${title}`);
      } else if (actions.has("Changes Requested")) {
        reviewLines.push(`- Reviewed: ${title}`);
      } else if (actions.has("Commented on PR")) {
        reviewLines.push(`- Reviewed: ${title}`);
      }
    }
  }

  const lines = [...terminalTransitions, ...createdLines, ...mergedLines, ...reviewLines];
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
