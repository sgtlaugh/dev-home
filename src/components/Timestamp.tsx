import React from "react";
import { formatRelativeTime } from "../utils/time";

export function Timestamp({ timestamp }: { timestamp: string }) {
  const now = Date.now();
  const actTime = new Date(timestamp).getTime();
  const hoursAgo = (now - actTime) / (1000 * 60 * 60);

  const exactTime = new Date(timestamp).toLocaleTimeString("en-US", {
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
    <span className="activity-time" title={hoursAgo >= 24 ? exactTime : undefined}>
      {displayText}
    </span>
  );
}
