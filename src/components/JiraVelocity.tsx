import React, { useState, useMemo } from "react";
import { IconChartBar } from "@tabler/icons-react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import { useJiraVelocity } from "../hooks/useJiraVelocity";
import { EmptyState } from "./EmptyState";
import { VelocityChart } from "./VelocityChart";
import { Timestamp } from "./Timestamp";

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

export const JiraVelocity: React.FC<{ active: boolean }> = ({ active }) => {
  const [preset, setPreset] = useState<Preset>(() => {
    try {
      const stored = localStorage.getItem("jira-velocity:preset");
      if (stored && ["30d", "90d", "6mo", "1y"].includes(stored)) return stored as Preset;
    } catch {
      /* ignore */
    }
    return "30d";
  });
  const [showAllIssues, setShowAllIssues] = useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem("jira-velocity:preset", preset);
    } catch {
      /* ignore */
    }
  }, [preset]);

  React.useEffect(() => {
    setShowAllIssues(false);
  }, [preset]);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = now.toISOString().split("T")[0];
    const from = new Date(now);
    if (preset === "30d") from.setDate(from.getDate() - 30);
    else if (preset === "90d") from.setDate(from.getDate() - 90);
    else if (preset === "6mo") from.setMonth(from.getMonth() - 6);
    else from.setFullYear(from.getFullYear() - 1);
    return { startDate: from.toISOString().split("T")[0], endDate: end };
  }, [preset]);

  const { metrics, completedIssues, loading, error } = useJiraVelocity(startDate, endDate, active);

  const trendColor =
    metrics?.velocity.trend === "improving"
      ? "#1a7f37"
      : metrics?.velocity.trend === "declining"
        ? "#cf222e"
        : "#9a6700";

  const trendArrow =
    metrics?.velocity.trendPercentage && metrics.velocity.trendPercentage > 0 ? "↑" : "↓";

  const visibleIssues = showAllIssues ? completedIssues : completedIssues.slice(0, 10);

  return (
    <div style={{ padding: "1rem" }}>
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
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>
            Completed
          </div>
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
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>
            Story Points
          </div>
        </div>
        <div
          className="stat-card"
          style={{
            flex: 1,
            textAlign: "center",
          }}
          title={`Recent half vs older half (by ${metrics && metrics.totalStoryPoints > 0 ? "story points" : "task count"})`}
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
              <>
                {trendArrow}
                {Math.abs(metrics?.velocity.trendPercentage || 0).toFixed(0)}%
              </>
            )}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>Trend</div>
        </div>
      </div>

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
          <Card className="mb-4">
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

          {/* Completed Issues */}
          {completedIssues.length > 0 && (
            <Card style={{ minHeight: "auto" }}>
              <Card.Body>
                <h6 style={{ marginBottom: "1rem", fontWeight: 600 }}>
                  Completed Issues
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
                        <th>Key</th>
                        <th>Summary</th>
                        <th>Type</th>
                        <th>SP</th>
                        <th>Time</th>
                        <th>Resolved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleIssues.map((issue) => (
                        <tr key={issue.key}>
                          <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{issue.key}</td>
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
                          <td>
                            <Timestamp timestamp={issue.resolutiondate} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {completedIssues.length > 10 && (
                  <div style={{ textAlign: "center", marginTop: 4 }}>
                    <button
                      className="see-more-btn"
                      onClick={() => setShowAllIssues(!showAllIssues)}
                    >
                      {showAllIssues ? "Show less" : `Show all ${completedIssues.length} issues`}
                    </button>
                  </div>
                )}
              </Card.Body>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
