import React from "react";
import Spinner from "react-bootstrap/Spinner";
import { IconChecklist } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";

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

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table" style={{ fontSize: "0.8125rem" }}>
        <thead>
          <tr>
            <th style={{ width: 32 }} title="Priority" />
            <th title="JIRA ticket identifier">Ticket</th>
            <th title="Issue summary">Summary</th>
            <th title="Current issue status">Status</th>
            <th title="Project the issue belongs to">Project</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => {
            const browseUrl = jiraBase ? `${jiraBase}/browse/${issue.key}` : "";

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
                <td style={{ maxWidth: 420 }}>
                  <div className="text-truncate-custom">{issue.summary}</div>
                </td>
                <td>
                  <StatusBadge
                    statusName={issue.status.name}
                    colorName={issue.status.statusCategory.colorName}
                  />
                </td>
                <td>
                  <span className="badge badge-status-neutral">{issue.project.key}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
