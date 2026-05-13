import React from "react";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import {
  IconBrandGithub,
  IconTicket,
  IconGitPullRequest,
  IconMessageCircle,
  IconStatusChange,
  IconCirclePlus,
  IconChecks,
  IconGitCommit,
} from "@tabler/icons-react";
import { ActivityItem } from "../services/activity";
import { formatRelativeTime } from "../utils/time";

interface ActivityProps {
  activities: ActivityItem[];
  loading: boolean;
}

function getActivityIcon(item: ActivityItem) {
  if (item.type === "github") {
    if (item.action.includes("commit")) return <IconGitCommit size={14} />;
    if (item.action.includes("PR")) return <IconGitPullRequest size={14} />;
    if (item.action.includes("Approved")) return <IconChecks size={14} />;
    return <IconBrandGithub size={14} />;
  }

  if (item.action.includes("Created")) return <IconCirclePlus size={14} />;
  if (item.action.includes("Comment")) return <IconMessageCircle size={14} />;
  if (item.action.includes("status")) return <IconStatusChange size={14} />;
  return <IconTicket size={14} />;
}

function getActivityBadgeClass(item: ActivityItem): string {
  if (item.type === "github") {
    if (item.action.includes("Committed") || item.action.includes("Created PR"))
      return "badge-status-green";
    if (item.action.includes("Approved") || item.action.includes("Merged"))
      return "badge-status-purple";
    if (item.action.includes("Comment")) return "badge-status-blue";
    return "badge-status-neutral";
  }

  if (item.action.includes("Created")) return "badge-status-green";
  if (item.action.includes("Comment")) return "badge-status-blue";
  if (item.action.includes("status")) return "badge-status-yellow";
  return "badge-status-neutral";
}

export const Activity: React.FC<ActivityProps> = ({ activities, loading }) => {
  if (loading && activities.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-secondary-custom text-center py-5" style={{ fontSize: "0.875rem" }}>
        No activity in the last 24 hours
      </div>
    );
  }

  return (
    <div className="activity-list">
      {activities.map((item) => (
        <div key={item.id} className="activity-item">
          <div className="activity-icon">{getActivityIcon(item)}</div>
          <div className="activity-content">
            <div className="activity-header">
              <Badge bg="" className={getActivityBadgeClass(item)} style={{ fontSize: "0.625rem" }}>
                {item.action}
              </Badge>
              <span className="activity-time">{formatRelativeTime(item.timestamp)}</span>
            </div>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="activity-title">
              {item.title}
            </a>
          </div>
        </div>
      ))}
    </div>
  );
};
