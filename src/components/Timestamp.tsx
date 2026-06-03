import React from "react";
import { formatRelativeTime } from "../utils/time";

export function Timestamp({ timestamp }: { timestamp: string }) {
  const now = Date.now();
  const actTime = new Date(timestamp).getTime();
  const hoursAgo = (now - actTime) / (1000 * 60 * 60);

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

  let displayText: string;
  if (hoursAgo < 24) {
    displayText = exactTime;
  } else {
    displayText = formatRelativeTime(timestamp);
  }

  return (
    <span className="activity-time" title={fullDateTime}>
      {displayText}
    </span>
  );
}
