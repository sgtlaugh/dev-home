import React from "react";
import { usePeerActivity } from "../hooks/usePeerActivity";
import { useConfig } from "../hooks/useConfig";
import { ActivityTimeline } from "./ActivityTimeline";

export const PeerActivity: React.FC<{ active: boolean }> = ({ active }) => {
  const { activities, loading } = usePeerActivity(active);
  const { githubUsername } = useConfig();

  return (
    <ActivityTimeline
      activities={activities}
      loading={loading}
      emptyMessage="No collaborative activity on PRs yet."
      currentUsername={githubUsername}
    />
  );
};
