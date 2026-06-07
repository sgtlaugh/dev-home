import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import { IconChevronDown, IconChevronsDown, IconChevronsUp } from "@tabler/icons-react";
import {
  IconBrandGithub,
  IconTicket,
  IconGitPullRequest,
  IconMessageCircle,
  IconStatusChange,
  IconCirclePlus,
  IconChecks,
  IconGitCommit,
  IconGitMerge,
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
  CollapsedActivity,
} from "../utils/activityUtils";
import { categorizeAction, ACTION_CATEGORIES } from "../utils/activityCategories";
import { ActivityBarChart, computeStreak } from "./ActivityBarChart";

interface ActivityTimelineProps {
  activities: ActivityItem[];
  loading: boolean;
  emptyMessage: string;
  currentUsername?: string;
  dailyCounts?: {
    date: string;
    count: number;
    segments: { category: string; count: number; color: string }[];
  }[];
}

function getActivityIcon(item: ActivityItem) {
  if (item.type === "github") {
    if (item.action.includes("commit") || item.action.includes("Committed"))
      return <IconGitCommit size={16} />;
    if (item.action.includes("PR")) return <IconGitPullRequest size={16} />;
    if (item.action.includes("Approved")) return <IconChecks size={16} />;
    return <IconBrandGithub size={16} />;
  }

  if (item.action.includes("Created")) return <IconCirclePlus size={16} />;
  if (item.action.includes("Comment")) return <IconMessageCircle size={16} />;
  if (item.action.includes("status")) return <IconStatusChange size={16} />;
  return <IconTicket size={16} />;
}

function getAccentColor(item: ActivityItem): string {
  return getBadgeColor(getActivityBadgeClass(item));
}

function getPrState(collapsed: CollapsedActivity): string | undefined {
  for (const action of collapsed.actions) {
    if (action.metadata?.prState) return action.metadata.prState;
  }
  return undefined;
}

function ExpandableSection({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, children]);

  return (
    <div
      style={{
        maxHeight: expanded ? height : 0,
        overflow: "hidden",
        transition: "max-height 250ms ease",
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  activities,
  loading,
  emptyMessage,
  currentUsername,
  dailyCounts,
}) => {
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [activeActors, setActiveActors] = useState<Set<string>>(new Set());

  const stats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of activities) {
      const cat = categorizeAction(a.action);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return ACTION_CATEGORIES.filter((c) => counts.has(c.label)).map((c) => ({
      label: c.label,
      color: c.color,
      count: counts.get(c.label)!,
    }));
  }, [activities]);

  const uniqueActors = useMemo(() => {
    if (!currentUsername) return [];
    const map = new Map<string, { login: string; avatar_url: string }>();
    for (const a of activities) {
      const actor = a.metadata?.actor;
      if (actor && actor.login !== currentUsername && !map.has(actor.login)) {
        map.set(actor.login, actor);
      }
    }
    return Array.from(map.values());
  }, [activities, currentUsername]);

  const filteredActivities = useMemo(() => {
    let result = activities;
    if (activeFilters.size > 0) {
      result = result.filter((a) => activeFilters.has(categorizeAction(a.action)));
    }
    if (activeActors.size > 0) {
      result = result.filter((a) => a.metadata?.actor && activeActors.has(a.metadata.actor.login));
    }
    return result;
  }, [activities, activeFilters, activeActors]);

  const groupedActivities = useMemo(
    () => groupActivitiesByDate(filteredActivities),
    [filteredActivities],
  );

  const toggleExpanded = (entityKey: string) => {
    const newSet = new Set(expandedEntities);
    if (newSet.has(entityKey)) {
      newSet.delete(entityKey);
    } else {
      newSet.add(entityKey);
    }
    setExpandedEntities(newSet);
  };

  const toggleFilter = (label: string) => {
    const newSet = new Set(activeFilters);
    if (newSet.has(label)) {
      newSet.delete(label);
    } else {
      newSet.add(label);
    }
    setActiveFilters(newSet);
  };

  const toggleDateGroup = useCallback(
    (items: CollapsedActivity[]) => {
      const expandableItems = items.filter(
        (i) => i.actions.length > 1 || i.actions.some((a) => a.metadata?.commentBody),
      );
      const keys = expandableItems.map((i) => i.entityKey);
      const allExpanded = keys.every((k) => expandedEntities.has(k));
      const newSet = new Set(expandedEntities);
      for (const k of keys) {
        if (allExpanded) {
          newSet.delete(k);
        } else {
          newSet.add(k);
        }
      }
      setExpandedEntities(newSet);
    },
    [expandedEntities],
  );

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
      {/* Action type filters with counts + streak */}
      {stats.length > 1 && (
        <div className="activity-filters">
          {stats.map((s) => (
            <button
              key={s.label}
              className={`activity-filter-chip${activeFilters.has(s.label) ? " active" : ""}`}
              onClick={() => toggleFilter(s.label)}
            >
              <div
                className="activity-stat-dot"
                style={{ backgroundColor: s.color, width: 6, height: 6 }}
              />
              {s.label}
              <span className="activity-filter-count">{s.count}</span>
            </button>
          ))}
          {dailyCounts &&
            (() => {
              const streak = computeStreak(dailyCounts);
              return streak > 0 ? (
                <span className="activity-streak-badge">{streak} day streak</span>
              ) : null;
            })()}
        </div>
      )}

      {/* Actor filters (peer activity only) */}
      {uniqueActors.length > 0 && (
        <div className="activity-actor-filters">
          {uniqueActors.map((actor) => (
            <button
              key={actor.login}
              className={`activity-actor-chip${activeActors.has(actor.login) ? " active" : ""}`}
              onClick={() =>
                setActiveActors((prev) => {
                  const next = new Set(prev);
                  if (next.has(actor.login)) next.delete(actor.login);
                  else next.add(actor.login);
                  return next;
                })
              }
            >
              <img src={actor.avatar_url} alt={actor.login} />@{actor.login}
            </button>
          ))}
        </div>
      )}

      {/* Bar chart */}
      {dailyCounts && dailyCounts.length > 0 && (
        <ActivityBarChart dailyCounts={dailyCounts} activities={activities} />
      )}

      {/* Timeline */}
      {Array.from(groupedActivities.entries()).map(
        ([dateLabel, { collapsed: items, actionCount }]) => {
          const expandableItems = items.filter(
            (i) => i.actions.length > 1 || i.actions.some((a) => a.metadata?.commentBody),
          );
          const allExpanded = expandableItems.every((i) => expandedEntities.has(i.entityKey));

          return (
            <div key={dateLabel} className="activity-section">
              <div className="activity-date-label">
                {dateLabel}
                <Badge
                  bg="secondary"
                  pill
                  style={{ fontSize: "0.7rem", marginLeft: "8px", verticalAlign: "middle" }}
                >
                  {actionCount}
                </Badge>
                {expandableItems.length > 0 && (
                  <button
                    className="activity-date-toggle"
                    onClick={() => toggleDateGroup(items)}
                    title={allExpanded ? "Collapse all" : "Expand all"}
                  >
                    {allExpanded ? <IconChevronsUp size={14} /> : <IconChevronsDown size={14} />}
                  </button>
                )}
              </div>
              <div className="activity-list">
                {items.map((collapsed) => {
                  const latestAction = collapsed.actions[0];
                  const entityActionCount = collapsed.actions.length;
                  const reviewBadge = getReviewBadgeLabel(collapsed.reviewState);
                  const isExpanded = expandedEntities.has(collapsed.entityKey);
                  const hasCommentPreview = collapsed.actions.some((a) => a.metadata?.commentBody);
                  const showExpand = entityActionCount > 1 || hasCommentPreview;
                  const accentColor = getAccentColor(latestAction);
                  const prState = getPrState(collapsed);

                  let lastActor: { login: string; avatar_url: string } | undefined;
                  for (const action of collapsed.actions) {
                    const actor = action.metadata?.actor;
                    if (actor && actor.login !== currentUsername) {
                      lastActor = actor;
                      break;
                    }
                  }

                  return (
                    <div key={collapsed.entityKey}>
                      <div
                        className="activity-item"
                        style={{
                          cursor: showExpand ? "pointer" : "default",
                          borderLeftColor: accentColor,
                        }}
                        onClick={() => showExpand && toggleExpanded(collapsed.entityKey)}
                      >
                        <div className="activity-icon" style={{ color: accentColor }}>
                          {getActivityIcon(latestAction)}
                        </div>
                        <div className="activity-content">
                          <div className="activity-header">
                            <div
                              style={{
                                width: "18px",
                                height: "16px",
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
                                    backgroundColor: accentColor,
                                    opacity: 0.7,
                                  }}
                                />
                              )}
                            </div>
                            {lastActor && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  flexShrink: 0,
                                }}
                              >
                                <img
                                  src={lastActor.avatar_url}
                                  alt={lastActor.login}
                                  title={lastActor.login}
                                  style={{
                                    width: "24px",
                                    height: "24px",
                                    borderRadius: "50%",
                                    border: "2px solid #d1d9e0",
                                  }}
                                />
                                {currentUsername && (
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "#656d76",
                                      fontWeight: 500,
                                    }}
                                  >
                                    @{lastActor.login}
                                  </span>
                                )}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              {reviewBadge && (
                                <Badge
                                  bg=""
                                  className={getReviewBadgeClass(collapsed.reviewState)}
                                  style={{ fontSize: "0.7rem", fontWeight: 600 }}
                                >
                                  {reviewBadge}
                                </Badge>
                              )}
                              {!reviewBadge && (
                                <Badge
                                  bg=""
                                  className={getActivityBadgeClass(latestAction)}
                                  style={{ fontSize: "0.7rem", fontWeight: 600 }}
                                >
                                  {getActionSummary(collapsed.actions)}
                                </Badge>
                              )}
                              {prState && prState !== "open" && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                    fontSize: "0.65rem",
                                    fontWeight: 600,
                                    color: prState === "merged" ? "#8250df" : "#cf222e",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                  }}
                                >
                                  {prState === "merged" && <IconGitMerge size={12} />}
                                  {prState}
                                </span>
                              )}
                              {entityActionCount > 1 && (
                                <Badge
                                  bg=""
                                  className="badge-status-neutral"
                                  style={{ fontSize: "0.6rem" }}
                                >
                                  {entityActionCount}
                                </Badge>
                              )}
                            </div>
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
                      <ExpandableSection expanded={isExpanded}>
                        <div className="activity-expanded">
                          {collapsed.actions.map((action) => (
                            <div key={action.id}>
                              <div className="activity-expanded-action">
                                {action.metadata?.actor && (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      flexShrink: 0,
                                    }}
                                  >
                                    <img
                                      src={action.metadata.actor.avatar_url}
                                      alt={action.metadata.actor.login}
                                      title={action.metadata.actor.login}
                                      style={{
                                        width: "20px",
                                        height: "20px",
                                        borderRadius: "50%",
                                        border: "1px solid #d1d9e0",
                                      }}
                                    />
                                    {currentUsername && (
                                      <span style={{ fontSize: "0.7rem", color: "#656d76" }}>
                                        @{action.metadata.actor.login}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <a
                                  href={action.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ textDecoration: "none" }}
                                >
                                  <Badge
                                    bg=""
                                    className={getActivityBadgeClass(action)}
                                    style={{
                                      fontSize: "0.65rem",
                                      flexShrink: 0,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {action.action}
                                  </Badge>
                                </a>
                                <Timestamp timestamp={action.timestamp} />
                              </div>
                              {action.metadata?.commentBody && (
                                <a
                                  href={action.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="activity-comment-preview"
                                  title="View on GitHub"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {action.metadata.commentBody}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </ExpandableSection>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        },
      )}
    </div>
  );
};
