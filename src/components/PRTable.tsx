import React from "react";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import { IconGitPullRequest, IconEye } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { Timestamp } from "./Timestamp";
import { EmptyState } from "./EmptyState";
import { Tooltip } from "./Tooltip";

const REVIEW_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  APPROVED: { label: "Approved", badgeClass: "badge-status-green" },
  CHANGES_REQUESTED: { label: "Changes Requested", badgeClass: "badge-status-red" },
  REVIEWED: { label: "Reviewed", badgeClass: "badge-status-neutral" },
};

function getAccentColor(pr: GitHubPR, isReview: boolean): string {
  if (pr.draft) return "#656d76";
  if (isReview) return "#0969da";
  if (pr.review_status === "APPROVED") return "#1a7f37";
  if (pr.review_status === "CHANGES_REQUESTED") return "#cf222e";
  return "#1a7f37";
}

interface PRCardProps {
  pr: GitHubPR;
  variant: "my-prs" | "review-requests";
}

const PRCard: React.FC<PRCardProps> = ({ pr, variant }) => {
  const isReview = variant === "review-requests";
  const accentColor = getAccentColor(pr, isReview);
  const reviewConfig = pr.review_status ? REVIEW_STATUS_CONFIG[pr.review_status] : null;

  return (
    <div
      className="activity-item"
      style={{
        borderLeftColor: accentColor,
        cursor: "pointer",
      }}
      onClick={() => window.open(pr.html_url, "_blank")}
    >
      <div className="activity-icon" style={{ color: accentColor }}>
        {isReview ? <IconEye size={16} /> : <IconGitPullRequest size={16} />}
      </div>
      <div className="activity-content" style={{ minWidth: 0 }}>
        <div className="activity-header">
          {isReview && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <Tooltip text={pr.user.login}>
                <img
                  src={pr.user.avatar_url}
                  alt={pr.user.login}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: "2px solid #d1d9e0",
                  }}
                />
              </Tooltip>
              <span style={{ fontSize: "0.75rem", color: "#656d76", fontWeight: 500 }}>
                @{pr.user.login}
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            {pr.draft && (
              <Badge bg="" className="badge-status-neutral" style={{ fontSize: "0.65rem" }}>
                Draft
              </Badge>
            )}
            {!pr.draft && !isReview && (
              <Badge bg="" className="badge-status-green" style={{ fontSize: "0.65rem" }}>
                Open
              </Badge>
            )}
            {reviewConfig && (
              <Badge bg="" className={reviewConfig.badgeClass} style={{ fontSize: "0.65rem" }}>
                {reviewConfig.label}
              </Badge>
            )}
            <ChecksStatusIcon status={pr.checks_status} />
          </div>
          <Timestamp timestamp={pr.updated_at} label={isReview ? "Last activity" : undefined} />
        </div>
        <a
          href={pr.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="activity-title"
          onClick={(e) => e.stopPropagation()}
        >
          {!isReview && `#${pr.number} `}
          {pr.title}
        </a>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginTop: "4px",
            flexWrap: "wrap",
          }}
        >
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
          <span style={{ fontSize: "0.65rem", color: "#656d76" }}>{"→"}</span>
          <span className="branch-tag" style={{ fontSize: "0.65rem" }}>
            {pr.base.ref}
          </span>
          {(pr.additions > 0 || pr.deletions > 0) && (
            <span style={{ fontSize: "0.65rem", color: "#656d76" }}>
              <span style={{ color: "#1a7f37", fontWeight: 600 }}>+{pr.additions}</span>
              {" / "}
              <span style={{ color: "#cf222e", fontWeight: 600 }}>-{pr.deletions}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface PRTableProps {
  prs: GitHubPR[];
  loading: boolean;
  variant: "my-prs" | "review-requests";
}

export const PRTable: React.FC<PRTableProps> = ({ prs, loading, variant }) => {
  const isMyPRs = variant === "my-prs";

  if (loading && prs.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <EmptyState
        icon={
          isMyPRs ? (
            <IconGitPullRequest size={40} stroke={1.5} />
          ) : (
            <IconEye size={40} stroke={1.5} />
          )
        }
        title={isMyPRs ? "No open pull requests" : "No review requests"}
        description={
          isMyPRs
            ? "You don't have any open pull requests at the moment."
            : "No one has requested your review on any pull requests."
        }
      />
    );
  }

  // Group by date (like activity timeline)
  const sorted = [...prs].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
  const grouped = new Map<string, GitHubPR[]>();
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  for (const pr of sorted) {
    const prDate = new Date(pr.updated_at);
    const prDateOnly = new Date(prDate.getFullYear(), prDate.getMonth(), prDate.getDate());
    let dateKey: string;
    if (prDateOnly.getTime() === todayDate.getTime()) {
      dateKey = "Today";
    } else if (prDateOnly.getTime() === yesterdayDate.getTime()) {
      dateKey = "Yesterday";
    } else {
      dateKey = prDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(pr);
  }

  return (
    <>
      <div className="activity-timeline">
        {Array.from(grouped.entries()).map(([dateLabel, datePRs]) => (
          <div key={dateLabel} className="activity-section">
            <div className="activity-date-label">
              {dateLabel}
              <Badge
                bg="secondary"
                pill
                style={{ fontSize: "0.7rem", marginLeft: "8px", verticalAlign: "middle" }}
              >
                {datePRs.length}
              </Badge>
            </div>
            <div className="activity-list">
              {datePRs.map((pr) => (
                <PRCard key={pr.id} pr={pr} variant={variant} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
