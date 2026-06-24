import { ActivityItem } from "../services/activity";
import { getActionBadgeClass, getActionPriority } from "./activityCategories";

export interface CollapsedActivity {
  entityKey: string;
  title: string;
  url: string;
  lastTimestamp: string;
  actions: ActivityItem[];
  reviewState?: string;
}

export function getActivityBadgeClass(item: ActivityItem): string {
  return getActionBadgeClass(item.action);
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
    collapsed.actions.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    collapsed.reviewState = getReviewState(collapsed.actions);
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

export function getActionSummaries(actions: ActivityItem[]): {
  text: string;
  badgeAction: ActivityItem;
}[] {
  const seen = new Set<string>();
  const result: { text: string; badgeAction: ActivityItem }[] = [];
  for (const action of actions) {
    if (!seen.has(action.action)) {
      seen.add(action.action);
      result.push({ text: action.action, badgeAction: action });
    }
  }
  return result.sort((a, b) => getActionPriority(a.text) - getActionPriority(b.text));
}
