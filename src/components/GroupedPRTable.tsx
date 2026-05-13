import React, { useState } from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { GitHubPR } from "../types";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";

interface GroupedPRTableProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: never;
  headers: React.ReactNode;
  columnCount: number;
  renderRow: (pr: GitHubPR, onClick: () => void) => React.ReactNode;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}

export const GroupedPRTable: React.FC<GroupedPRTableProps> = ({
  prs,
  loading,
  headers,
  renderRow,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}) => {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);

  if (loading && prs.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (prs.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <Table hover>
        <thead>
          <tr>{headers}</tr>
        </thead>
        <tbody>
          {prs.map((pr) => (
            <React.Fragment key={pr.id}>{renderRow(pr, () => setSelectedPR(pr))}</React.Fragment>
          ))}
        </tbody>
      </Table>

      <DescriptionModal
        show={!!selectedPR}
        onHide={() => setSelectedPR(null)}
        title={selectedPR ? `#${selectedPR.number} ${selectedPR.title}` : ""}
        subtitle={selectedPR?.repo_full_name}
        description={selectedPR?.body || ""}
        url={selectedPR?.html_url}
        checks={selectedPR?.checks}
      />
    </>
  );
};
