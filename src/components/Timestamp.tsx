import React from "react";

interface TimestampProps {
  timestamp: string;
  label?: string;
}

export function Timestamp({ timestamp, label }: TimestampProps) {
  const date = new Date(timestamp);
  const exactTime = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const fullDateTime = date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const displayText = exactTime;

  const tooltipText = label ? `${label} · ${fullDateTime}` : fullDateTime;

  return (
    <span className="activity-time" title={tooltipText}>
      {displayText}
    </span>
  );
}
