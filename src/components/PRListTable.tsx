import React, { memo } from "react";
import Badge from "react-bootstrap/Badge";
import { IconGitPullRequest, IconGitMerge } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { ChecksStatusIcon } from "./ChecksStatusIcon";

interface PRListTableProps {
  prs: GitHubPR[];
  onPRClick: (pr: GitHubPR) => void;
  sortAsc: boolean;
  onToggleSort: () => void;
}

const statusBadge = (pr: GitHubPR) => {
  if (pr.merged)
    return (
      <Badge bg="" className="badge-status-purple" style={{ fontSize: "0.6rem" }}>
        Merged
      </Badge>
    );
  if (pr.state === "open")
    return (
      <Badge bg="" className="badge-status-green" style={{ fontSize: "0.6rem" }}>
        Open
      </Badge>
    );
  return (
    <Badge bg="" className="badge-status-red" style={{ fontSize: "0.6rem" }}>
      Closed
    </Badge>
  );
};

function formatDate(timestamp: string) {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return {
    short: `${yyyy}-${mm}-${dd}`,
    full: `${yyyy}-${mm}-${dd} ${hh}:${min}`,
  };
}

const PRRow = memo(function PRRow({
  pr,
  index,
  onClick,
}: {
  pr: GitHubPR;
  index: number;
  onClick: () => void;
}) {
  const iconColor = pr.merged ? "#8250df" : pr.state === "open" ? "#1a7f37" : "#cf222e";
  const { short, full } = formatDate(pr.created_at);

  return (
    <tr className="pr-table-row" onClick={onClick} style={{ cursor: "pointer" }}>
      <td
        style={{
          width: 28,
          color: "#656d76",
          fontSize: "0.7rem",
          textAlign: "right",
          paddingRight: 4,
        }}
      >
        {index}
      </td>
      <td style={{ width: 28, paddingRight: 0, color: iconColor }}>
        {pr.merged ? <IconGitMerge size={14} /> : <IconGitPullRequest size={14} />}
      </td>
      <td style={{ width: 90 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {statusBadge(pr)}
          {pr.draft && (
            <Badge bg="" className="badge-status-neutral" style={{ fontSize: "0.55rem" }}>
              Draft
            </Badge>
          )}
          <ChecksStatusIcon status={pr.checks_status} />
        </div>
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <a
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="activity-title"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: "0.8rem", wordBreak: "break-word", whiteSpace: "normal" }}
          >
            #{pr.number} {pr.title}
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <Badge
              bg=""
              className="badge-status-neutral"
              style={{ fontSize: "0.55rem", fontWeight: 500 }}
            >
              {pr.repo_full_name}
            </Badge>
            <span className="branch-tag" style={{ fontSize: "0.6rem" }}>
              {pr.head.ref}
            </span>
            <span style={{ fontSize: "0.6rem", color: "#656d76" }}>→</span>
            <span className="branch-tag" style={{ fontSize: "0.6rem" }}>
              {pr.base.ref}
            </span>
          </div>
        </div>
      </td>
      <td style={{ whiteSpace: "nowrap", width: 90 }}>
        <span className="activity-time" title={full}>
          {short}
        </span>
      </td>
    </tr>
  );
});

export const PRListTable: React.FC<PRListTableProps> = ({
  prs,
  onPRClick,
  sortAsc,
  onToggleSort,
}) => {
  return (
    <table className="pr-list-table">
      <thead>
        <tr>
          <th style={{ width: 28 }} />
          <th style={{ width: 28 }} />
          <th style={{ width: 90 }}>Status</th>
          <th>Pull Request</th>
          <th
            style={{ width: 90, cursor: "pointer", userSelect: "none" }}
            onClick={onToggleSort}
            title={sortAsc ? "Oldest first" : "Newest first"}
          >
            Date {sortAsc ? "↑" : "↓"}
          </th>
        </tr>
      </thead>
      <tbody>
        {prs.map((pr, i) => (
          <PRRow key={pr.id} pr={pr} index={i + 1} onClick={() => onPRClick(pr)} />
        ))}
      </tbody>
    </table>
  );
};
