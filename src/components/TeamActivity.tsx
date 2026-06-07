import React from "react";
import { useTeamActivity } from "../hooks/useTeamActivity";
import { useConfig } from "../hooks/useConfig";
import { ActivityTimeline } from "./ActivityTimeline";

export const TeamActivity: React.FC<{ active: boolean }> = ({ active }) => {
  const { activities, loading } = useTeamActivity(active);
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
