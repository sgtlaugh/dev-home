import React, { useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import { IconChecklist } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";

function hashHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
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
};

interface JiraTasksProps {
  issues: JiraIssue[];
  loading: boolean;
  baseUrl?: string;
}

export const JiraTasks: React.FC<JiraTasksProps> = ({ issues: rawIssues, loading, baseUrl }) => {
  const issues = [...rawIssues].sort(
    (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
  );
  const jiraBase = baseUrl?.replace(/\/+$/, "") || "";

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
      .sort((a, b) => b[1].count - a[1].count)
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

  const hasStoryPoints = issues.some((i) => (i.storyPoints || 0) > 0);

  return (
    <div>
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
              <div
                key={s.name}
                style={{
                  width: `${s.pct}%`,
                  backgroundColor: s.color,
                  transition: "width 0.4s ease",
                }}
                title={`${s.name}: ${s.count} (${Math.round(s.pct)}%)`}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
            {statusBreakdown.map((s) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: s.color,
                  }}
                />
                <span style={{ fontSize: "0.7rem", color: "#656d76" }}>
                  {s.name} ({s.count})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: "0.8125rem" }}>
          <thead>
            <tr>
              <th style={{ width: 32 }} title="Priority">
                P
              </th>
              <th title="JIRA ticket identifier">Ticket</th>
              <th title="Issue summary">Summary</th>
              <th title="Issue type (Bug, Story, Task, etc.)">Type</th>
              <th title="Current issue status">Status</th>
              {hasStoryPoints && <th title="Story points assigned to this issue">SP</th>}
              <th title="Last updated date">Updated</th>
              <th title="Project the issue belongs to">Project</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => {
              const browseUrl = jiraBase ? `${jiraBase}/browse/${issue.key}` : "";
              const updatedDate = new Date(issue.updated);
              const short = `${updatedDate.getFullYear()}-${String(updatedDate.getMonth() + 1).padStart(2, "0")}-${String(updatedDate.getDate()).padStart(2, "0")}`;
              const full = `${short} ${String(updatedDate.getHours()).padStart(2, "0")}:${String(updatedDate.getMinutes()).padStart(2, "0")}`;

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
                    <span className="activity-time" title={full}>
                      {short}
                    </span>
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
