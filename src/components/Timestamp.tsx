import React from "react";
import { Tooltip } from "./Tooltip";

interface TimestampProps {
  timestamp: string;
  label?: string;
}

export function Timestamp({ timestamp, label }: TimestampProps) {
  const date = new Date(timestamp);

  const dateAndTime = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
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

  const tooltipText = label ? `${label} · ${fullDateTime}` : fullDateTime;

  return (
    <Tooltip text={tooltipText}>
      <span className="activity-time">{dateAndTime}</span>
    </Tooltip>
  );
}
