import React from "react";
import { IconCircleCheck, IconCircleX, IconClock, IconCircleMinus } from "@tabler/icons-react";
import { Tooltip } from "./Tooltip";

export const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; title: string }
> = {
  SUCCESS: { icon: IconCircleCheck, color: "#1a7f37", title: "Passed" },
  FAILURE: { icon: IconCircleX, color: "#cf222e", title: "Failed" },
  ERROR: { icon: IconCircleX, color: "#cf222e", title: "Errored" },
  PENDING: { icon: IconClock, color: "#9a6700", title: "Pending" },
  EXPECTED: { icon: IconClock, color: "#9a6700", title: "Expected" },
  IN_PROGRESS: { icon: IconClock, color: "#9a6700", title: "In progress" },
  QUEUED: { icon: IconClock, color: "#9a6700", title: "Queued" },
  NEUTRAL: { icon: IconCircleMinus, color: "#656d76", title: "Neutral" },
  SKIPPED: { icon: IconCircleMinus, color: "#656d76", title: "Skipped" },
  CANCELLED: { icon: IconCircleMinus, color: "#656d76", title: "Cancelled" },
  STALE: { icon: IconCircleMinus, color: "#656d76", title: "Stale" },
  ACTION_REQUIRED: { icon: IconClock, color: "#9a6700", title: "Action required" },
  STARTUP_FAILURE: { icon: IconCircleX, color: "#cf222e", title: "Startup failure" },
  TIMED_OUT: { icon: IconCircleX, color: "#cf222e", title: "Timed out" },
};

export const ChecksStatusIcon: React.FC<{ status?: string | null }> = ({ status }) => {
  if (!status) {
    return (
      <Tooltip text="No checks">
        <IconCircleMinus size={14} stroke={1.8} color="#959da5" />
      </Tooltip>
    );
  }
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <Tooltip text={config.title}>
      <Icon size={14} stroke={1.8} color={config.color} />
    </Tooltip>
  );
};
