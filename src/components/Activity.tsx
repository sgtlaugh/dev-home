import React, { useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import {
  IconBrandGithub,
  IconTicket,
  IconGitPullRequest,
  IconMessageCircle,
  IconStatusChange,
  IconCirclePlus,
  IconChecks,
  IconGitCommit,
} from "@tabler/icons-react";
import { ActivityItem } from "../services/activity";
import { formatRelativeTime } from "../utils/time";

interface ActivityProps {
  activities: ActivityItem[];
  loading: boolean;
}

function getActivityIcon(item: ActivityItem) {
  if (item.type === "github") {
    if (item.action.includes("commit")) return <IconGitCommit size={14} />;
    if (item.action.includes("PR")) return <IconGitPullRequest size={14} />;
    if (item.action.includes("Approved")) return <IconChecks size={14} />;
    return <IconBrandGithub size={14} />;
  }

  if (item.action.includes("Created")) return <IconCirclePlus size={14} />;
  if (item.action.includes("Comment")) return <IconMessageCircle size={14} />;
  if (item.action.includes("status")) return <IconStatusChange size={14} />;
  return <IconTicket size={14} />;
}

function getActivityBadgeClass(item: ActivityItem): string {
  if (item.type === "github") {
    if (item.action.includes("Committed")) return "badge-status-green-light";
    if (item.action.includes("Created PR")) return "badge-status-green-dark";
    if (item.action.includes("Approved")) return "badge-status-purple-light";
    if (item.action.includes("Merged")) return "badge-status-purple-dark";
    if (item.action.includes("Comment")) return "badge-status-blue";
    return "badge-status-neutral";
  }

  if (item.action.includes("Created")) return "badge-status-blue-dark";
  if (item.action.includes("Comment")) return "badge-status-blue";
  if (item.action.includes("status")) return "badge-status-yellow";
  return "badge-status-neutral";
}

interface CollapsedActivity {
  entityKey: string;
  title: string;
  url: string;
  lastTimestamp: string;
  actions: ActivityItem[];
  reviewState?: string;
}

function getReviewState(items: ActivityItem[]): string | undefined {
  for (const item of items) {
    if (item.action === "Approved PR") return "approved";
    if (item.action === "Requested changes") return "changes_requested";
  }
  return undefined;
}

function collapseActivitiesByEntity(activities: ActivityItem[]): CollapsedActivity[] {
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

function groupActivitiesByDate(
  activities: ActivityItem[],
): Map<string, { collapsed: CollapsedActivity[]; actionCount: number }> {
  const collapsed = collapseActivitiesByEntity(activities);
  const groups = new Map<string, { collapsed: CollapsedActivity[]; actionCount: number }>();
  const now = Date.now();

  for (const activity of collapsed) {
    const actTime = new Date(activity.lastTimestamp).getTime();
    const hoursAgo = (now - actTime) / (1000 * 60 * 60);
    let dateKey: string;

    if (hoursAgo < 24) {
      dateKey = "Today";
    } else if (hoursAgo < 48) {
      dateKey = "Yesterday";
    } else {
      const actDate = new Date(activity.lastTimestamp);
      dateKey = actDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    if (!groups.has(dateKey)) {
      groups.set(dateKey, { collapsed: [], actionCount: 0 });
    }
    const group = groups.get(dateKey)!;
    group.collapsed.push(activity);
    group.actionCount += activity.actions.length;
  }

  return groups;
}

function getReviewBadgeClass(reviewState?: string): string {
  if (reviewState === "approved") return "badge-status-green-dark";
  if (reviewState === "changes_requested") return "badge-status-red-dark";
  return "";
}

function getReviewBadgeLabel(reviewState?: string): string | null {
  if (reviewState === "approved") return "Approved";
  if (reviewState === "changes_requested") return "Changes Requested";
  return null;
}

function getActionSummary(actions: ActivityItem[]): string {
  const actionTypes = new Set(actions.map((a) => a.action));
  const types = Array.from(actionTypes);
  if (types.length === 1) return types[0];
  if (types.length === 2) return types.join(" & ");
  return `${types[0]} & ${types.length - 1} more`;
}

export const Activity: React.FC<ActivityProps> = ({ activities, loading }) => {
  const groupedActivities = useMemo(() => groupActivitiesByDate(activities), [activities]);

  if (loading && activities.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-secondary-custom text-center py-5" style={{ fontSize: "0.875rem" }}>
        No activity in the last 24 hours
      </div>
    );
  }

  return (
    <div className="activity-timeline">
      {Array.from(groupedActivities.entries()).map(
        ([dateLabel, { collapsed: items, actionCount }]) => (
          <div key={dateLabel} className="activity-section">
            <div className="activity-date-label">
              {dateLabel} ({actionCount})
            </div>
            <div className="activity-list">
              {items.map((collapsed) => {
                const latestAction = collapsed.actions[0];
                const entityActionCount = collapsed.actions.length;
                const reviewBadge = getReviewBadgeLabel(collapsed.reviewState);

                return (
                  <div key={collapsed.entityKey} className="activity-item">
                    <div className="activity-dot" />
                    <div className="activity-icon">{getActivityIcon(latestAction)}</div>
                    <div className="activity-content">
                      <div className="activity-header">
                        {reviewBadge && (
                          <Badge
                            bg=""
                            className={getReviewBadgeClass(collapsed.reviewState)}
                            style={{ fontSize: "0.625rem", marginRight: "4px" }}
                          >
                            {reviewBadge}
                          </Badge>
                        )}
                        {!reviewBadge && (
                          <Badge
                            bg=""
                            className="badge-status-neutral"
                            style={{ fontSize: "0.625rem", marginRight: "4px" }}
                          >
                            {getActionSummary(collapsed.actions)}
                          </Badge>
                        )}
                        {entityActionCount > 1 && (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            ({entityActionCount})
                          </span>
                        )}
                        <span className="activity-time">
                          {formatRelativeTime(collapsed.lastTimestamp)}
                        </span>
                      </div>
                      <a
                        href={collapsed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="activity-title"
                      >
                        {collapsed.title}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ),
      )}
    </div>
  );
};
