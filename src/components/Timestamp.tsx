import React from "react";
import { Tooltip } from "./Tooltip";

interface TimestampProps {
  timestamp: string;
  label?: string;
  format?: "datetime" | "date";
}

export function Timestamp({ timestamp, label, format = "datetime" }: TimestampProps) {
  const date = new Date(timestamp);

  const fullDateTime = date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const tooltipText = label ? `${label} · ${fullDateTime}` : fullDateTime;

  let display: string;
  if (format === "date") {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    display = `${yyyy}-${mm}-${dd}`;
  } else {
    display = date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return (
    <Tooltip text={tooltipText}>
      <span className="activity-time">{display}</span>
    </Tooltip>
  );
}
