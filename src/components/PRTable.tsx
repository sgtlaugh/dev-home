import React, { useState } from "react";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import { IconGitPullRequest, IconEye } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { Timestamp } from "./Timestamp";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";

const REVIEW_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  APPROVED: { label: "Approved", badgeClass: "badge-status-green" },
  CHANGES_REQUESTED: { label: "Changes Requested", badgeClass: "badge-status-red" },
  REVIEWED: { label: "Reviewed", badgeClass: "badge-status-neutral" },
};

function getAccentColor(pr: GitHubPR, isReview: boolean): string {
  if (pr.draft) return "#8b949e";
  if (isReview) return "#58a6ff";
  if (pr.review_status === "APPROVED") return "#3fb950";
  if (pr.review_status === "CHANGES_REQUESTED") return "#f85149";
  return "#3fb950";
}

function getBodyPreview(body: string): string {
  if (!body) return "";
  const firstLine = body.split("\n").find((l) => l.trim().length > 0) || "";
  return firstLine.slice(0, 200) + (firstLine.length > 200 ? "..." : "");
}

interface PRCardProps {
  pr: GitHubPR;
  variant: "my-prs" | "review-requests";
  onClick: () => void;
}

const PRCard: React.FC<PRCardProps> = ({ pr, variant, onClick }) => {
  const isReview = variant === "review-requests";
  const accentColor = getAccentColor(pr, isReview);
  const preview = getBodyPreview(pr.body);
  const reviewConfig = pr.review_status ? REVIEW_STATUS_CONFIG[pr.review_status] : null;

  return (
    <div
      className="activity-item"
      style={{
        borderLeftColor: accentColor,
        cursor: "pointer",
      }}
      onClick={onClick}
    >
      <div className="activity-icon" style={{ color: accentColor }}>
        {isReview ? <IconEye size={16} /> : <IconGitPullRequest size={16} />}
      </div>
      <div className="activity-content" style={{ minWidth: 0 }}>
        <div className="activity-header">
          {isReview && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <img
                src={pr.user.avatar_url}
                alt={pr.user.login}
                title={pr.user.login}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: "2px solid #21262d",
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "#8b949e", fontWeight: 500 }}>
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
          <Timestamp timestamp={pr.updated_at} />
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
          <span style={{ fontSize: "0.65rem", color: "#8b949e" }}>{"→"}</span>
          <span className="branch-tag" style={{ fontSize: "0.65rem" }}>
            {pr.base.ref}
          </span>
        </div>
        {preview && (
          <div
            style={{
              marginTop: "6px",
              fontSize: "0.75rem",
              color: "#8b949e",
              fontStyle: "italic",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {preview}
          </div>
        )}
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
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
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
  const now = Date.now();
  for (const pr of sorted) {
    const hoursAgo = (now - new Date(pr.updated_at).getTime()) / (1000 * 60 * 60);
    let dateKey: string;
    if (hoursAgo < 24) {
      dateKey = "Today";
    } else if (hoursAgo < 48) {
      dateKey = "Yesterday";
    } else {
      dateKey = new Date(pr.updated_at).toLocaleDateString("en-US", {
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
                <PRCard key={pr.id} pr={pr} variant={variant} onClick={() => setSelectedPR(pr)} />
              ))}
            </div>
          </div>
        ))}
      </div>

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
