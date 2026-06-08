import React from "react";

interface StatusBadgeProps {
  statusName: string;
  colorName: string;
}

const STATUS_NAME_COLORS: Record<string, string> = {
  "In Progress": "badge-status-dark",
  "Code Review": "badge-status-indigo",
  "Product Review": "badge-status-coral",
  Done: "badge-status-green",
  "Won't Fix": "badge-status-brown",
};

function getBadgeClass(colorName: string, statusName: string): string {
  const nameOverride = STATUS_NAME_COLORS[statusName];
  if (nameOverride) return nameOverride;

  const normalized = colorName.toLowerCase();
  switch (normalized) {
    case "blue-gray":
    case "new":
    case "blue":
    case "indigo":
      return "badge-status-blue";
    case "yellow":
      return "badge-status-yellow";
    case "green":
    case "done":
      return "badge-status-green";
    case "red":
      return "badge-status-red";
    default:
      return "badge-status-neutral";
  }
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ statusName, colorName }) => {
  const badgeClass = getBadgeClass(colorName, statusName);

  return <span className={`badge ${badgeClass}`}>{statusName}</span>;
};
