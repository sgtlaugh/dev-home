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
    if (item.action.includes("Changes Requested")) return "badge-status-yellow";
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
    if (item.action.includes("Changes Requested") && !state) state = "changes_requested";
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
    const actDate = new Date(timestamp);
    const todayDate = new Date(now);

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
  if (reviewState === "changes_requested") return "badge-status-yellow";
  return "";
}

export function getReviewBadgeLabel(reviewState?: string): string | null {
  if (reviewState === "merged") return "Merged";
  if (reviewState === "approved") return "Approved";
  if (reviewState === "changes_requested") return "Changes Requested";
  return null;
}

export function getActionSummary(actions: ActivityItem[]): {
  text: string;
  badgeAction: ActivityItem;
} {
  const actionTypes = new Set(actions.map((a) => a.action));
  const types = Array.from(actionTypes);

  const creationAction = actions.find((a) => a.action === "Created PR" || a.action === "Created");
  if (creationAction) return { text: creationAction.action, badgeAction: creationAction };

  let text: string;
  if (types.length === 1) text = types[0];
  else if (types.length === 2) text = types.join(" & ");
  else text = `${types[0]} & ${types.length - 1} more`;

  return { text, badgeAction: actions[0] };
}

export function getBadgeColor(badgeClass: string): string {
  const colorMap: Record<string, string> = {
    "badge-status-green-light": "#1a7f37",
    "badge-status-green-dark": "#116329",
    "badge-status-blue": "#0969da",
    "badge-status-blue-dark": "#0550ae",
    "badge-status-purple-light": "#8250df",
    "badge-status-purple-dark": "#6639ba",
    "badge-status-yellow": "#9a6700",
    "badge-status-red": "#cf222e",
    "badge-status-red-dark": "#a40e26",
    "badge-status-neutral": "#656d76",
  };
  return colorMap[badgeClass] || "#d1d9e0";
}
