import React, { useState } from "react";
import { IconChartBar } from "@tabler/icons-react";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { useJiraVelocity } from "../hooks/useJiraVelocity";
import { EmptyState } from "./EmptyState";

type DateMode = "30d" | "60d" | "90d" | "custom";

export const JiraVelocity: React.FC<{ active: boolean }> = ({ active }) => {
  const [mode, setMode] = useState<DateMode>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const getDateRange = (): { start: string; end: string } => {
    const now = new Date();
    const toDate = now.toISOString().split("T")[0];

    if (mode === "custom") {
      return { start: customStart, end: customEnd };
    }

    const days = mode === "30d" ? 30 : mode === "60d" ? 60 : 90;
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);
    return {
      start: fromDate.toISOString().split("T")[0],
      end: toDate,
    };
  };

  const range = getDateRange();
  const { metrics, loading, error } = useJiraVelocity(range.start, range.end, active);

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
          <div className="stat-value" style={{ color: "#1a7f37" }}>
            {metrics?.velocity.tasksPerWeek.toFixed(1) || "0.0"}
          </div>
          <div className="stat-label">Tasks/Week</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#8250df" }}>
            {metrics?.averageCompletionTime.mean || "0h"}
          </div>
          <div className="stat-label">Avg Time</div>
        </div>
        <div className="stat-card" title="Second half of range vs first half">
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
          <div className="d-flex gap-3 align-items-center flex-wrap">
            <div className="segmented-control">
              <button
                className={`segmented-btn ${mode === "30d" ? "active" : ""}`}
                onClick={() => setMode("30d")}
              >
                30 Days
              </button>
              <button
                className={`segmented-btn ${mode === "60d" ? "active" : ""}`}
                onClick={() => setMode("60d")}
              >
                60 Days
              </button>
              <button
                className={`segmented-btn ${mode === "90d" ? "active" : ""}`}
                onClick={() => setMode("90d")}
              >
                90 Days
              </button>
              <button
                className={`segmented-btn ${mode === "custom" ? "active" : ""}`}
                onClick={() => setMode("custom")}
              >
                Custom
              </button>
            </div>

            {mode === "custom" && (
              <>
                <label style={{ marginBottom: 0 }}>
                  <span style={{ fontWeight: 500, marginRight: "0.5rem", fontSize: "0.8125rem" }}>
                    From:
                  </span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="filter-input"
                  />
                </label>
                <label style={{ marginBottom: 0 }}>
                  <span style={{ fontWeight: 500, marginRight: "0.5rem", fontSize: "0.8125rem" }}>
                    To:
                  </span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="filter-input"
                  />
                </label>
              </>
            )}
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
                  </tr>
                </thead>
                <tbody>
                  {metrics.completionsByWeek.map((week) => (
                    <tr key={week.weekRange}>
                      <td style={{ fontWeight: 500 }}>{week.weekRange}</td>
                      <td>{week.count}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          {/* Completion Time Details */}
          <Card>
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
