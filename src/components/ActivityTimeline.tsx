import React, { useMemo, useState } from "react";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import { IconChevronDown } from "@tabler/icons-react";
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
import { Timestamp } from "./Timestamp";
import {
  getActivityBadgeClass,
  getReviewBadgeClass,
  getReviewBadgeLabel,
  getActionSummary,
  getBadgeColor,
  groupActivitiesByDate,
} from "../utils/activityUtils";

interface ActivityTimelineProps {
  activities: ActivityItem[];
  loading: boolean;
  emptyMessage: string;
}

function getActivityIcon(item: ActivityItem) {
  if (item.type === "github") {
    if (item.action.includes("commit") || item.action.includes("Committed"))
      return <IconGitCommit size={14} />;
    if (item.action.includes("PR")) return <IconGitPullRequest size={14} />;
    if (item.action.includes("Approved")) return <IconChecks size={14} />;
    return <IconBrandGithub size={14} />;
  }

  if (item.action.includes("Created")) return <IconCirclePlus size={14} />;
  if (item.action.includes("Comment")) return <IconMessageCircle size={14} />;
  if (item.action.includes("status")) return <IconStatusChange size={14} />;
  return <IconTicket size={14} />;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  activities,
  loading,
  emptyMessage,
}) => {
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const groupedActivities = useMemo(() => groupActivitiesByDate(activities), [activities]);

  const toggleExpanded = (entityKey: string) => {
    const newSet = new Set(expandedEntities);
    if (newSet.has(entityKey)) {
      newSet.delete(entityKey);
    } else {
      newSet.add(entityKey);
    }
    setExpandedEntities(newSet);
  };

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
        {emptyMessage}
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
                const isExpanded = expandedEntities.has(collapsed.entityKey);
                const showExpand = entityActionCount > 1;

                // Collect unique actors across all actions in this entity
                const actorMap = new Map<string, { login: string; avatar_url: string }>();
                for (const action of collapsed.actions) {
                  const actor = action.metadata?.actor;
                  if (actor && !actorMap.has(actor.login)) {
                    actorMap.set(actor.login, actor);
                  }
                }
                const actors = Array.from(actorMap.values());

                return (
                  <div key={collapsed.entityKey}>
                    <div
                      className="activity-item"
                      style={{ cursor: showExpand ? "pointer" : "default" }}
                      onClick={() => showExpand && toggleExpanded(collapsed.entityKey)}
                    >
                      <div className="activity-dot" />
                      <div className="activity-icon">{getActivityIcon(latestAction)}</div>
                      <div className="activity-content">
                        <div className="activity-header">
                          <div
                            style={{
                              width: "18px",
                              height: "14px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {showExpand ? (
                              <IconChevronDown
                                size={14}
                                style={{
                                  transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                                  transition: "transform 200ms ease",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "50%",
                                  backgroundColor: getBadgeColor(
                                    getActivityBadgeClass(latestAction),
                                  ),
                                  opacity: 0.7,
                                }}
                              />
                            )}
                          </div>
                          {actors.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "2px",
                                marginRight: "4px",
                              }}
                            >
                              {actors.slice(0, 3).map((actor) => (
                                <img
                                  key={actor.login}
                                  src={actor.avatar_url}
                                  alt={actor.login}
                                  title={actor.login}
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    borderRadius: "50%",
                                  }}
                                />
                              ))}
                              {actors.length > 3 && (
                                <span
                                  style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}
                                >
                                  +{actors.length - 3}
                                </span>
                              )}
                            </div>
                          )}
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
                              className={getActivityBadgeClass(latestAction)}
                              style={{ fontSize: "0.625rem", marginRight: "4px" }}
                            >
                              {getActionSummary(collapsed.actions)}
                            </Badge>
                          )}
                          {entityActionCount > 1 && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                              }}
                            >
                              ({entityActionCount})
                            </span>
                          )}
                          <Timestamp timestamp={collapsed.lastTimestamp} />
                        </div>
                        <a
                          href={collapsed.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="activity-title"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {collapsed.title}
                        </a>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ marginTop: "6px", marginLeft: "76px" }}>
                        {collapsed.actions.map((action) => (
                          <div
                            key={action.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              paddingTop: "3px",
                              paddingBottom: "3px",
                              fontSize: "0.8rem",
                            }}
                          >
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                              •
                            </span>
                            {action.metadata?.actor && (
                              <img
                                src={action.metadata.actor.avatar_url}
                                alt={action.metadata.actor.login}
                                title={action.metadata.actor.login}
                                style={{
                                  width: "16px",
                                  height: "16px",
                                  borderRadius: "50%",
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <Badge
                              bg=""
                              className={getActivityBadgeClass(action)}
                              style={{ fontSize: "0.625rem", flexShrink: 0 }}
                            >
                              {action.action}
                            </Badge>
                            <Timestamp timestamp={action.timestamp} />
                          </div>
                        ))}
                      </div>
                    )}
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
