import React, { memo } from "react";
import Badge from "react-bootstrap/Badge";
import { IconGitPullRequest, IconGitMerge } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { Timestamp } from "./Timestamp";

interface PRListTableProps {
  prs: GitHubPR[];
  onPRClick: (pr: GitHubPR) => void;
}

function statusLabel(pr: GitHubPR): { text: string; cls: string } {
  if (pr.merged) return { text: "Merged", cls: "badge-status-purple" };
  if (pr.state === "open") return { text: "Open", cls: "badge-status-green" };
  return { text: "Closed", cls: "badge-status-red" };
}

const PRRow = memo(function PRRow({ pr, onClick }: { pr: GitHubPR; onClick: () => void }) {
  const iconColor = pr.merged ? "#8250df" : pr.state === "open" ? "#1a7f37" : "#cf222e";
  const status = statusLabel(pr);

  return (
    <tr className="pr-table-row" onClick={onClick} style={{ cursor: "pointer" }}>
      <td
        style={{
          width: 20,
          paddingRight: 0,
          color: iconColor,
          verticalAlign: "top",
          paddingTop: 12,
        }}
      >
        {pr.merged ? <IconGitMerge size={15} /> : <IconGitPullRequest size={15} />}
      </td>
      <td>
        <div>
          <a
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="activity-title"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: "0.8125rem" }}
          >
            {pr.title}
          </a>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: 2,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "0.65rem", color: "#656d76" }}>
              {pr.repo_full_name}#{pr.number}
            </span>
            <span className="branch-tag" style={{ fontSize: "0.6rem" }}>
              {pr.head.ref} → {pr.base.ref}
            </span>
          </div>
        </div>
      </td>
      <td style={{ width: 80, verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginLeft: "-6px" }}>
          <Badge
            bg=""
            className={status.cls}
            style={{
              fontSize: "0.575rem",
              display: "inline-block",
              width: 44,
              textAlign: "center",
            }}
          >
            {status.text}
          </Badge>
          {pr.draft && (
            <Badge bg="" className="badge-status-neutral" style={{ fontSize: "0.5rem" }}>
              Draft
            </Badge>
          )}
          <ChecksStatusIcon status={pr.checks_status} />
        </div>
      </td>
      <td style={{ whiteSpace: "nowrap", width: 80, verticalAlign: "middle" }}>
        <Timestamp format="date" timestamp={pr.created_at} />
      </td>
    </tr>
  );
});

export const PRListTable: React.FC<PRListTableProps> = ({ prs, onPRClick }) => {
  return (
    <table className="pr-list-table">
      <thead>
        <tr>
          <th style={{ width: 20 }} />
          <th>Pull Request</th>
          <th style={{ width: 80 }}>Status</th>
          <th style={{ width: 80 }}>Date</th>
        </tr>
      </thead>
      <tbody>
        {prs.map((pr) => (
          <PRRow key={pr.id} pr={pr} onClick={() => onPRClick(pr)} />
        ))}
      </tbody>
    </table>
  );
};
