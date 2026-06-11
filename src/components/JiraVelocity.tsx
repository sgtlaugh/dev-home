import React, { useState, useMemo } from "react";
import {
  IconChartBar,
  IconTrendingUp,
  IconTrendingDown,
  IconEqual,
  IconInfoCircle,
} from "@tabler/icons-react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import { useJiraVelocity } from "../hooks/useJiraVelocity";
import { useConfig } from "../hooks/useConfig";
import { EmptyState } from "./EmptyState";
import { VelocityChart } from "./VelocityChart";
import { getLocalDateString } from "../utils/dateUtils";
import { Tooltip } from "./Tooltip";

type Preset = "30d" | "90d" | "6mo" | "1y";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6mo", label: "6 Months" },
  { key: "1y", label: "1 Year" },
];

const TYPE_COLORS: Record<string, string> = {
  Bug: "badge-status-red",
  Story: "badge-status-green",
  Task: "badge-status-blue",
  "Sub-task": "badge-status-neutral",
};

const TYPE_BAR_COLORS: Record<string, string> = {
  Bug: "#cf222e",
  Story: "#1a7f37",
  Task: "#0969da",
  "Sub-task": "#656d76",
};

export const JiraVelocity: React.FC<{
  active: boolean;
  onFetchComplete?: (label: string, ms: number) => void;
}> = ({ active, onFetchComplete }) => {
  const [preset, setPreset] = useState<Preset>(() => {
    try {
      const stored = localStorage.getItem("jira-velocity:preset");
      if (stored && ["30d", "90d", "6mo", "1y"].includes(stored)) return stored as Preset;
    } catch {
      /* ignore */
    }
    return "30d";
  });
  const { jiraBaseUrl } = useConfig();
  const jiraBase = jiraBaseUrl?.replace(/\/+$/, "") || "";

  React.useEffect(() => {
    try {
      localStorage.setItem("jira-velocity:preset", preset);
    } catch {
      /* ignore */
    }
  }, [preset]);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = getLocalDateString(now.toISOString());
    const from = new Date(now);
    if (preset === "30d") from.setDate(from.getDate() - 30);
    else if (preset === "90d") from.setDate(from.getDate() - 90);
    else if (preset === "6mo") from.setMonth(from.getMonth() - 6);
    else from.setFullYear(from.getFullYear() - 1);
    return { startDate: getLocalDateString(from.toISOString()), endDate: end };
  }, [preset]);

  const { metrics, completedIssues, loading, error } = useJiraVelocity(
    startDate,
    endDate,
    active,
    onFetchComplete,
  );

  const trendColor =
    metrics?.velocity.trend === "improving"
      ? "#1a7f37"
      : metrics?.velocity.trend === "declining"
        ? "#cf222e"
        : "#9a6700";

  const TrendIcon =
    metrics?.velocity.trend === "improving"
      ? IconTrendingUp
      : metrics?.velocity.trend === "declining"
        ? IconTrendingDown
        : IconEqual;

  const visibleIssues = completedIssues;

  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of completedIssues) {
      counts.set(issue.type, (counts.get(issue.type) || 0) + 1);
    }
    const total = completedIssues.length;
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
        color: TYPE_BAR_COLORS[type] || "#656d76",
      }));
  }, [completedIssues]);

  return (
    <div>
      {/* Hero Stats */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <div
          className="stat-card"
          style={{
            flex: 1,
            textAlign: "center",
            backgroundColor: "rgba(9, 105, 218, 0.05)",
          }}
        >
          <div style={{ fontSize: "1.35rem", fontWeight: 600, color: "#0969da" }}>
            {loading ? "—" : metrics?.totalCompleted || 0}
          </div>
          <div className="stat-card-label">Completed</div>
        </div>
        <div
          className="stat-card"
          style={{
            flex: 1,
            textAlign: "center",
            backgroundColor: "rgba(227, 121, 92, 0.05)",
          }}
        >
          <div style={{ fontSize: "1.35rem", fontWeight: 600, color: "#e3795c" }}>
            {loading ? "—" : metrics?.totalStoryPoints || 0}
          </div>
          <div className="stat-card-label">Story Points</div>
        </div>
        <div
          className="stat-card"
          style={{
            flex: 1,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 600,
              color: loading ? "#656d76" : trendColor,
            }}
          >
            {loading ? (
              "—"
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <TrendIcon size={20} stroke={2.2} />
                {Math.abs(metrics?.velocity.trendPercentage || 0).toFixed(0)}%
              </span>
            )}
          </div>
          <div
            className="stat-card-label"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              justifyContent: "center",
            }}
          >
            Trend
            {!loading && metrics && (
              <span className="trend-info-wrap">
                <IconInfoCircle
                  size={11}
                  stroke={1.8}
                  style={{ color: "#8b949e", cursor: "help" }}
                />
                <span className="trend-info-tip">
                  Compares recent half vs older half by{" "}
                  {metrics.totalStoryPoints > 0 ? "story points" : "task count"}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Type Breakdown */}
      {typeBreakdown.length > 0 && !loading && (
        <div style={{ marginBottom: "0.75rem" }}>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              display: "flex",
            }}
          >
            {typeBreakdown.map((t) => (
              <Tooltip key={t.type} text={`${t.type}: ${t.count} (${Math.round(t.pct)}%)`}>
                <div
                  style={{
                    width: `${t.pct}%`,
                    backgroundColor: t.color,
                    transition: "width 0.4s ease",
                  }}
                />
              </Tooltip>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
            {typeBreakdown.map((t) => (
              <div key={t.type} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: t.color,
                  }}
                />
                <span style={{ fontSize: "0.7rem", color: "#656d76" }}>
                  {t.type} ({t.count})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <Card className="controls-card mb-4">
        <Card.Body>
          <div className="segmented-control">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={`segmented-btn ${preset === p.key ? "active" : ""}`}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Card.Body>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="d-flex justify-content-center align-items-center py-5">
          <Spinner animation="border" variant="secondary" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="mb-4" style={{ borderColor: "#cf222e" }}>
          <Card.Body style={{ color: "#cf222e" }}>Error: {error}</Card.Body>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && (!metrics || metrics.totalCompleted === 0) && (
        <EmptyState
          icon={<IconChartBar size={40} stroke={1.5} />}
          title="No completed tasks"
          description="No tasks were completed in this period."
        />
      )}

      {/* Content */}
      {!loading && !error && metrics && metrics.totalCompleted > 0 && (
        <>
          {/* Velocity Chart */}
          <Card className="mb-4" style={{ minHeight: "auto" }}>
            <Card.Body style={{ paddingBottom: "0.5rem" }}>
              <h6 style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Weekly Velocity</h6>
              <VelocityChart
                series={[
                  {
                    data: metrics.completionsByWeek.map((w) => ({
                      weekRange: w.weekRange,
                      value: w.count,
                    })),
                    color: "#0969da",
                    label: "Issues",
                  },
                  ...(metrics.totalStoryPoints > 0
                    ? [
                        {
                          data: metrics.completionsByWeek.map((w) => ({
                            weekRange: w.weekRange,
                            value: w.storyPoints,
                          })),
                          color: "#1a7f37",
                          label: "Story Points",
                        },
                      ]
                    : []),
                ]}
              />
            </Card.Body>
          </Card>

          {/* Completed */}
          {completedIssues.length > 0 && (
            <Card style={{ minHeight: "auto" }}>
              <Card.Body>
                <h6 style={{ marginBottom: "1rem", fontWeight: 600 }}>
                  Completed
                  <Badge
                    bg="secondary"
                    pill
                    style={{ fontSize: "0.65rem", marginLeft: 8, verticalAlign: "middle" }}
                  >
                    {completedIssues.length}
                  </Badge>
                </h6>
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ fontSize: "0.8125rem" }}>
                    <thead>
                      <tr>
                        <th>
                          <Tooltip text="JIRA ticket identifier">Ticket</Tooltip>
                        </th>
                        <th>
                          <Tooltip text="Issue summary">Summary</Tooltip>
                        </th>
                        <th>
                          <Tooltip text="Issue type (Bug, Story, Task, etc.)">Type</Tooltip>
                        </th>
                        <th>
                          <Tooltip text="Story points assigned to this issue">SP</Tooltip>
                        </th>
                        <th>
                          <Tooltip text="Days from creation to resolution">Time</Tooltip>
                        </th>
                        <th>
                          <Tooltip text="Date the issue was resolved">Resolved</Tooltip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleIssues.map((issue) => (
                        <tr
                          key={issue.key}
                          style={{ cursor: jiraBase ? "pointer" : undefined }}
                          onClick={() =>
                            jiraBase && window.open(`${jiraBase}/browse/${issue.key}`, "_blank")
                          }
                        >
                          <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                            {jiraBase ? (
                              <a
                                href={`${jiraBase}/browse/${issue.key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="activity-title"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {issue.key}
                              </a>
                            ) : (
                              issue.key
                            )}
                          </td>
                          <td style={{ maxWidth: 300 }}>
                            <div className="text-truncate-custom">{issue.summary}</div>
                          </td>
                          <td>
                            <Badge
                              bg=""
                              className={TYPE_COLORS[issue.type] || "badge-status-neutral"}
                              style={{ fontSize: "0.65rem" }}
                            >
                              {issue.type}
                            </Badge>
                          </td>
                          <td>{issue.storyPoints || "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {issue.completionDays < 1
                              ? "<1d"
                              : `${Math.ceil(issue.completionDays)}d`}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {(() => {
                              const d = new Date(issue.resolutiondate);
                              const short = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                              const full = `${short} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                              return (
                                <Tooltip text={full}>
                                  <span className="activity-time">{short}</span>
                                </Tooltip>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card.Body>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
