import { ActivityItem } from "../services/activity";

export interface CollapsedActivity {
  entityKey: string;
  title: string;
  url: string;
  lastTimestamp: string;
  actions: ActivityItem[];
  reviewState?: string;
}

export function getActivityBadgeClass(item: ActivityItem): string {
  if (item.type === "github") {
    if (item.action.includes("Committed")) return "badge-status-green-dark";
    if (item.action.includes("Approved")) return "badge-status-purple-light";
    if (item.action.includes("Created PR")) return "badge-status-green-dark";
    if (item.action.includes("Merged")) return "badge-status-purple-dark";
    if (item.action.includes("Comment")) return "badge-status-blue";
    if (item.action.includes("Requested changes")) return "badge-status-yellow";
    return "badge-status-neutral";
  }

  if (item.action.includes("Created")) return "badge-status-green-dark";
  if (item.action.includes("Comment")) return "badge-status-blue";
  if (item.action.includes("status")) return "badge-status-purple";
  return "badge-status-neutral";
}

export function getReviewState(items: ActivityItem[]): string | undefined {
  let state: string | undefined;
  for (const item of items) {
    if (item.action === "Merged PR") return "merged";
    if (item.action.includes("Requested changes") && !state) state = "changes_requested";
    if (item.action === "Approved PR" && !state) state = "approved";
  }
  return state;
}

export function collapseActivitiesByEntity(activities: ActivityItem[]): CollapsedActivity[] {
  const map = new Map<string, CollapsedActivity>();

  for (const activity of activities) {
    if (!map.has(activity.entityKey)) {
      map.set(activity.entityKey, {
        entityKey: activity.entityKey,
        title: activity.title,
        url: activity.url,
        lastTimestamp: activity.timestamp,
        actions: [],
      });
    }
    const collapsed = map.get(activity.entityKey)!;
    collapsed.actions.push(activity);
    if (new Date(activity.timestamp).getTime() > new Date(collapsed.lastTimestamp).getTime()) {
      collapsed.lastTimestamp = activity.timestamp;
    }
  }

  for (const collapsed of map.values()) {
    collapsed.reviewState = getReviewState(collapsed.actions);
    collapsed.actions.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime(),
  );
}

export function groupActivitiesByDate(
  activities: ActivityItem[],
): Map<string, { collapsed: CollapsedActivity[]; actionCount: number }> {
  const collapsed = collapseActivitiesByEntity(activities);
  const groups = new Map<string, { collapsed: CollapsedActivity[]; actionCount: number }>();
  const now = Date.now();

  function getDateKey(timestamp: string): string {
    const actTime = new Date(timestamp).getTime();
    const hoursAgo = (now - actTime) / (1000 * 60 * 60);

    if (hoursAgo < 24) {
      return "Today";
    } else if (hoursAgo < 48) {
      return "Yesterday";
    } else {
      const actDate = new Date(timestamp);
      return actDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  }

  for (const activity of collapsed) {
    const dateKey = getDateKey(activity.lastTimestamp);
    const filteredActions = activity.actions.filter((a) => getDateKey(a.timestamp) === dateKey);
    if (filteredActions.length === 0) continue;

    if (!groups.has(dateKey)) {
      groups.set(dateKey, { collapsed: [], actionCount: 0 });
    }
    const group = groups.get(dateKey)!;
    group.collapsed.push({ ...activity, actions: filteredActions });
    group.actionCount += filteredActions.length;
  }

  return groups;
}

export function getReviewBadgeClass(reviewState?: string): string {
  if (reviewState === "merged") return "badge-status-purple-dark";
  if (reviewState === "approved") return "badge-status-purple-light";
  if (reviewState === "changes_requested") return "badge-status-red-dark";
  return "";
}

export function getReviewBadgeLabel(reviewState?: string): string | null {
  if (reviewState === "merged") return "Merged";
  if (reviewState === "approved") return "Approved";
  if (reviewState === "changes_requested") return "Changes Requested";
  return null;
}

export function getActionSummary(actions: ActivityItem[]): string {
  const actionTypes = new Set(actions.map((a) => a.action));
  const types = Array.from(actionTypes);
  if (types.length === 1) return types[0];
  if (types.length === 2) return types.join(" & ");
  return `${types[0]} & ${types.length - 1} more`;
}

export function getBadgeColor(badgeClass: string): string {
  const colorMap: Record<string, string> = {
    "badge-status-green-light": "#3fb950",
    "badge-status-green-dark": "#3fb950",
    "badge-status-blue": "#58a6ff",
    "badge-status-blue-dark": "#58a6ff",
    "badge-status-purple-light": "#bc8ef9",
    "badge-status-purple-dark": "#bc8ef9",
    "badge-status-yellow": "#d29922",
    "badge-status-red": "#f85149",
    "badge-status-red-dark": "#f85149",
    "badge-status-neutral": "#8b949e",
  };
  return colorMap[badgeClass] || "#30363d";
}
