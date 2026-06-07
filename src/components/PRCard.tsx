import React, { memo } from "react";
import Badge from "react-bootstrap/Badge";
import { IconGitPullRequest, IconGitMerge } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { Timestamp } from "./Timestamp";

interface PRCardProps {
  pr: GitHubPR;
  onClick: () => void;
}

export const PRCard = memo(function PRCard({ pr, onClick }: PRCardProps) {
  const accentColor = pr.merged ? "#8250df" : pr.state === "open" ? "#1a7f37" : "#cf222e";

  return (
    <div
      className="activity-item"
      style={{ borderLeftColor: accentColor, cursor: "pointer" }}
      onClick={onClick}
    >
      <div className="activity-icon" style={{ color: accentColor }}>
        {pr.merged ? <IconGitMerge size={16} /> : <IconGitPullRequest size={16} />}
      </div>
      <div className="activity-content" style={{ minWidth: 0 }}>
        <div className="activity-header">
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            {pr.draft && (
              <Badge bg="" className="badge-status-neutral" style={{ fontSize: "0.65rem" }}>
                Draft
              </Badge>
            )}
            {pr.merged ? (
              <Badge bg="" className="badge-status-purple" style={{ fontSize: "0.65rem" }}>
                Merged
              </Badge>
            ) : pr.state === "open" ? (
              <Badge bg="" className="badge-status-green" style={{ fontSize: "0.65rem" }}>
                Open
              </Badge>
            ) : (
              <Badge bg="" className="badge-status-red" style={{ fontSize: "0.65rem" }}>
                Closed
              </Badge>
            )}
            <ChecksStatusIcon status={pr.checks_status} />
          </div>
          <Timestamp timestamp={pr.created_at} />
        </div>
        <a
          href={pr.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="activity-title"
          onClick={(e) => e.stopPropagation()}
        >
          #{pr.number} {pr.title}
        </a>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
          <Badge
            bg=""
            className="badge-status-neutral"
            style={{ fontSize: "0.6rem", fontWeight: 500 }}
          >
            {pr.repo_full_name}
          </Badge>
          <span className="branch-tag" style={{ fontSize: "0.65rem" }}>
            {pr.head.ref}
          </span>
          <span style={{ fontSize: "0.65rem", color: "#656d76" }}>→</span>
          <span className="branch-tag" style={{ fontSize: "0.65rem" }}>
            {pr.base.ref}
          </span>
        </div>
      </div>
    </div>
  );
});
