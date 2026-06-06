import React, { useState, useMemo } from "react";
import { IconChartBar } from "@tabler/icons-react";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { useJiraVelocity } from "../hooks/useJiraVelocity";
import { EmptyState } from "./EmptyState";

type Preset = "30d" | "90d" | "6mo" | "1y";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6mo", label: "6 Months" },
  { key: "1y", label: "1 Year" },
];

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

  React.useEffect(() => {
    try {
      localStorage.setItem("jira-velocity:preset", preset);
    } catch {
      /* ignore */
    }
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

  const { metrics, loading, error } = useJiraVelocity(startDate, endDate, active);

  const trendColor =
    metrics?.velocity.trend === "improving"
      ? "#1a7f37"
      : metrics?.velocity.trend === "declining"
        ? "#cf222e"
        : "#9a6700";

  const trendArrow =
    metrics?.velocity.trendPercentage && metrics.velocity.trendPercentage > 0 ? "↑" : "↓";

  return (
    <div style={{ padding: "1rem" }}>
      {/* Summary Stats */}
      <div className="d-flex gap-2 mb-4 flex-wrap">
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#0969da" }}>
            {metrics?.totalCompleted || 0}
          </div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#e3795c" }}>
            {metrics?.totalStoryPoints || 0}
          </div>
          <div className="stat-label">Story Points</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#1a7f37" }}>
            {metrics?.velocity.tasksPerWeek.toFixed(1) || "0.0"}
          </div>
          <div className="stat-label">Tasks/Week</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#e3795c" }}>
            {metrics?.storyPointsPerWeek?.toFixed(1) || "0.0"}
          </div>
          <div className="stat-label">SP/Week</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#8250df" }}>
            {metrics?.averageCompletionTime.mean || "0h"}
          </div>
          <div className="stat-label">Avg Time</div>
        </div>
        <div
          className="stat-card"
          title={`Recent half vs older half (by ${metrics && metrics.totalStoryPoints > 0 ? "story points" : "task count"})`}
        >
          <div className="stat-value" style={{ color: trendColor }}>
            {trendArrow}
            {Math.abs(metrics?.velocity.trendPercentage || 0).toFixed(0)}%
          </div>
          <div className="stat-label">Trend</div>
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

      {/* Weekly Breakdown Table */}
      {!loading && !error && metrics && metrics.totalCompleted > 0 && (
        <>
          <Card className="mb-4">
            <Card.Body>
              <h6 style={{ marginBottom: "1rem", fontWeight: 600 }}>Weekly Breakdown</h6>
              <Table hover>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Completed</th>
                    <th>Story Points</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const weeks = metrics.completionsByWeek;
                    const mid = Math.ceil(weeks.length / 2);
                    return weeks.map((week, i) => (
                      <tr
                        key={week.weekRange}
                        style={{
                          backgroundColor:
                            weeks.length >= 2
                              ? i < mid
                                ? "rgba(9, 105, 218, 0.04)"
                                : "rgba(130, 80, 223, 0.04)"
                              : undefined,
                        }}
                      >
                        <td style={{ fontWeight: 500 }}>{week.weekRange}</td>
                        <td>{week.count}</td>
                        <td>{week.storyPoints}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          {/* Completion Time Details */}
          <Card style={{ minHeight: "auto" }}>
            <Card.Body>
              <h6 style={{ marginBottom: "1rem", fontWeight: 600 }}>Completion Time Stats</h6>
              <div className="d-flex gap-3 flex-wrap">
                <div className="stat-card">
                  <div className="stat-value" style={{ color: "#1a7f37", fontSize: "1.5rem" }}>
                    {metrics.averageCompletionTime.mean}
                  </div>
                  <div className="stat-label">Mean</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: "#0969da", fontSize: "1.5rem" }}>
                    {metrics.averageCompletionTime.median}
                  </div>
                  <div className="stat-label">Median</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: "#8250df", fontSize: "1.5rem" }}>
                    {metrics.averageCompletionTime.fastest}
                  </div>
                  <div className="stat-label">Fastest</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: "#cf222e", fontSize: "1.5rem" }}>
                    {metrics.averageCompletionTime.slowest}
                  </div>
                  <div className="stat-label">Slowest</div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </>
      )}
    </div>
  );
};
