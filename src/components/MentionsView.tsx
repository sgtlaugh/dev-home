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
    <div>
      <div className="section-header">
        JIRA Mentions
        {jiraComments.length > 0 && (
          <Badge bg="secondary" pill>
            {jiraComments.length}
          </Badge>
        )}
      </div>
      <JiraComments comments={sortedJiraComments} loading={loading} baseUrl={jiraBaseUrl} />
    </div>
  );
};
