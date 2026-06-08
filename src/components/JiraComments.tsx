import React, { useState } from "react";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import { IconMessageCircle, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { JiraComment } from "../types";
import { EmptyState } from "./EmptyState";
import { truncateText } from "../utils/text";
import { Timestamp } from "./Timestamp";
import { API_BASE } from "../services/config";

function JiraAvatar({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const proxied = url ? `${API_BASE}/jira/avatar?url=${url}` : "";

  if (!url || failed) {
    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return <div className="avatar-md avatar-initials">{initials}</div>;
  }

  return <img src={proxied} alt={name} className="avatar-md" onError={() => setFailed(true)} />;
}

// Highlight @mentions in text
function highlightMentions(text: string, maxLen: number = 120): React.ReactNode {
  const truncated = truncateText(text, maxLen);
  const parts = truncated.split(/(@[\w-]+)/);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <mark key={i} style={{ backgroundColor: "rgba(88, 166, 255, 0.2)", fontWeight: 600 }}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

interface JiraCommentsProps {
  comments: JiraComment[];
  loading: boolean;
  baseUrl?: string;
}

export const JiraComments: React.FC<JiraCommentsProps> = ({ comments, loading, baseUrl }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedIds(newSet);
  };

  if (loading && comments.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <EmptyState
        icon={<IconMessageCircle size={40} stroke={1.5} />}
        title="No recent mentions"
        description="No one has mentioned you in JIRA comments recently."
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {comments.map((comment) => {
        const issueUrl = baseUrl
          ? `${baseUrl.replace(/\/$/, "")}/browse/${comment.issueKey}`
          : `#${comment.issueKey}`;

        return (
          <div key={comment.id} className="comment-card">
            <div className="d-flex gap-3 align-items-start">
              <JiraAvatar
                url={comment.author.avatarUrls?.["48x48"]}
                name={comment.author.displayName}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="d-flex justify-content-between align-items-center gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                      {comment.author.displayName}
                    </span>
                    <Timestamp timestamp={comment.created} />
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <a
                      href={issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        minWidth: "5.5rem",
                        textAlign: "right",
                      }}
                    >
                      {comment.issueKey}
                    </a>
                    {comment.type && (
                      <Badge
                        bg=""
                        className={
                          comment.type === "mentioned" ? "badge-status-blue" : "badge-status-green"
                        }
                        style={{
                          fontSize: "0.625rem",
                          padding: "2px 6px",
                          minWidth: "4.5rem",
                          textAlign: "center",
                        }}
                      >
                        {comment.type === "mentioned" ? "@mentioned" : "assigned"}
                      </Badge>
                    )}
                  </div>
                </div>
                <div
                  className="text-secondary-custom"
                  style={{ fontSize: "0.75rem", marginTop: 2 }}
                >
                  on: {comment.issueSummary}
                </div>
                <div
                  className="text-secondary-custom"
                  style={{
                    fontSize: "0.8125rem",
                    marginTop: 6,
                    lineHeight: 1.5,
                    cursor: "pointer",
                  }}
                  onClick={() => toggleExpanded(comment.id)}
                >
                  {expandedIds.has(comment.id)
                    ? comment.body?.text || ""
                    : highlightMentions(comment.body?.text || "", 120)}
                  {(comment.body?.text || "").length > 120 && (
                    <span
                      style={{
                        marginLeft: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {expandedIds.has(comment.id) ? (
                        <IconChevronUp size={14} />
                      ) : (
                        <IconChevronDown size={14} />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
