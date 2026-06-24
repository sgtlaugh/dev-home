import React, { useCallback, useMemo, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import { IconChecklist } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { DateControls } from "./DateControls";
import { formatLocalDate, formatLocalDateTime } from "../utils/dateUtils";
import { Tooltip } from "./Tooltip";

function hashHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 10) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

const TYPE_COLORS: Record<string, string> = {
  Bug: "badge-status-red",
  Story: "badge-status-green",
  Task: "badge-status-blue",
  "Sub-task": "badge-status-neutral",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  green: "#1a7f37",
  yellow: "#9a6700",
  blue: "#0969da",
};

const STATUS_NAME_BAR_COLORS: Record<string, string> = {
  "In Progress": "#57606a",
  "Code Review": "#4f46e5",
  "Product Review": "#e3795c",
  Done: "#1a7f37",
  "Won't Fix": "#8b3a2a",
};

const STATUS_ORDER: string[] = [
  "In Progress",
  "Code Review",
  "Product Review",
  "Done",
  "Won't Fix",
];

interface JiraTasksProps {
  issues: JiraIssue[];
  loading: boolean;
  baseUrl?: string;
}

export const JiraTasks: React.FC<JiraTasksProps> = ({ issues: rawIssues, loading, baseUrl }) => {
  const allIssues = useMemo(
    () =>
      [...rawIssues].sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()),
    [rawIssues],
  );
  const jiraBase = baseUrl?.replace(/\/+$/, "") || "";
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  const handleDateChange = useCallback((start: string, end: string) => {
    setDateRange({ start, end });
  }, []);

  const issues = useMemo(() => {
    if (!dateRange) return allIssues;
    const from = new Date(dateRange.start);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateRange.end);
    to.setHours(23, 59, 59, 999);
    return allIssues.filter((i) => {
      const d = new Date(i.updated);
      return d >= from && d <= to;
    });
  }, [allIssues, dateRange]);

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, { count: number; color: string }>();
    for (const issue of issues) {
      const name = issue.status.name;
      const colorName = issue.status.statusCategory.colorName;
      const entry = counts.get(name) || {
        count: 0,
        color: STATUS_NAME_BAR_COLORS[name] || STATUS_BAR_COLORS[colorName] || "#656d76",
      };
      entry.count++;
      counts.set(name, entry);
    }
    const total = issues.length;
    return Array.from(counts.entries())
      .sort((a, b) => {
        const ai = STATUS_ORDER.indexOf(a[0]);
        const bi = STATUS_ORDER.indexOf(b[0]);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(([name, { count, color }]) => ({
        name,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
        color,
      }));
  }, [issues]);

  if (loading && rawIssues.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (rawIssues.length === 0) {
    return (
      <EmptyState
        icon={<IconChecklist size={40} stroke={1.5} />}
        title="No assigned issues"
        description="You have no JIRA issues currently assigned to you. Enjoy the calm."
      />
    );
  }

  const filteredIssues = activeStatus
    ? issues.filter((i) => i.status.name === activeStatus)
    : issues;
  const hasStoryPoints = issues.some((i) => (i.storyPoints || 0) > 0);

  return (
    <div>
      <DateControls onDateChange={handleDateChange} />

      {/* Status breakdown bar */}
      {statusBreakdown.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              display: "flex",
            }}
          >
            {statusBreakdown.map((s) => (
              <Tooltip key={s.name} text={`${s.name}: ${s.count} (${Math.round(s.pct)}%)`}>
                <div
                  style={{
                    width: `${s.pct}%`,
                    backgroundColor: s.color,
                    transition: "width 0.4s ease",
                  }}
                />
              </Tooltip>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              marginTop: "0.4rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {statusBreakdown.map((s) => (
              <span
                key={s.name}
                onClick={() => setActiveStatus(activeStatus === s.name ? null : s.name)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  backgroundColor: activeStatus === s.name ? s.color : `${s.color}15`,
                  color: activeStatus === s.name ? "#fff" : s.color,
                  border: `1px solid ${s.color}${activeStatus === s.name ? "" : "30"}`,
                  transition: "all 0.2s ease",
                }}
              >
                {s.name} ({s.count})
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: "0.8125rem" }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <Tooltip text="Priority">P</Tooltip>
              </th>
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
                <Tooltip text="Current issue status">Status</Tooltip>
              </th>
              {hasStoryPoints && (
                <th>
                  <Tooltip text="Story points assigned to this issue">SP</Tooltip>
                </th>
              )}
              <th>
                <Tooltip text="Last updated date">Updated</Tooltip>
              </th>
              <th>
                <Tooltip text="Project the issue belongs to">Project</Tooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredIssues.map((issue) => {
              const browseUrl = jiraBase ? `${jiraBase}/browse/${issue.key}` : "";
              const updatedDate = new Date(issue.updated);
              const short = formatLocalDate(updatedDate);
              const full = formatLocalDateTime(updatedDate);

              return (
                <tr
                  key={issue.key}
                  style={{ cursor: jiraBase ? "pointer" : undefined }}
                  onClick={() => jiraBase && window.open(browseUrl, "_blank")}
                >
                  <td>
                    {issue.priority?.iconUrl && (
                      <img
                        src={issue.priority.iconUrl}
                        alt={issue.priority.name}
                        className="priority-icon"
                        style={{ marginLeft: "-3px" }}
                      />
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                    {jiraBase ? (
                      <a
                        href={browseUrl}
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
                      className={TYPE_COLORS[issue.issueType || "Task"] || "badge-status-neutral"}
                      style={{ fontSize: "0.65rem", marginLeft: "-6px" }}
                    >
                      {issue.issueType || "Task"}
                    </Badge>
                  </td>
                  <td>
                    <div style={{ marginLeft: "-6px" }}>
                      <StatusBadge
                        statusName={issue.status.name}
                        colorName={issue.status.statusCategory.colorName}
                      />
                    </div>
                  </td>
                  {hasStoryPoints && <td>{issue.storyPoints || "—"}</td>}
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Tooltip text={full}>
                      <span className="activity-time">{short}</span>
                    </Tooltip>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: `hsla(${hashHue(issue.project.key)}, 45%, 42%, 0.1)`,
                        color: `hsl(${hashHue(issue.project.key)}, 45%, 42%)`,
                        border: `1px solid hsla(${hashHue(issue.project.key)}, 45%, 42%, 0.2)`,
                        borderRadius: "999px",
                        padding: "0.2em 0.6em",
                      }}
                    >
                      {issue.project.key}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
