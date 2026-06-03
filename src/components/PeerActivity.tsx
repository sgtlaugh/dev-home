import React from "react";
import { usePeerActivity } from "../hooks/usePeerActivity";
import { ActivityTimeline } from "./ActivityTimeline";

export const PeerActivity: React.FC<{ active: boolean }> = ({ active }) => {
  const { activities, loading } = usePeerActivity(active);

  return (
    <ActivityTimeline
      activities={activities}
      loading={loading}
      emptyMessage="No collaborative activity on PRs yet."
    />
  );
};
