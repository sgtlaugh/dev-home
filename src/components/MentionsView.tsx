import React from "react";
import Badge from "react-bootstrap/Badge";
import { JiraComment } from "../types";
import { JiraComments } from "./JiraComments";

interface MentionsViewProps {
  jiraComments: JiraComment[];
  loading: boolean;
  jiraBaseUrl: string;
}

export const MentionsView: React.FC<MentionsViewProps> = ({
  jiraComments,
  loading,
  jiraBaseUrl,
}) => {
  const sortedJiraComments = [...jiraComments].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
  );

  return (
    <div className="notes-container">
      <div className="notes-header">
        <h2 className="notes-title">JIRA Notifications</h2>
        {jiraComments.length > 0 && (
          <Badge bg="" className="badge-mentions-count" pill>
            {jiraComments.length}
          </Badge>
        )}
      </div>
      <div className="notes-divider" />
      <JiraComments comments={sortedJiraComments} loading={loading} baseUrl={jiraBaseUrl} />
    </div>
  );
};
