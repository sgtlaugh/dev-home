import React, { useMemo } from "react";
import { ActivityItem } from "../services/activity";
import { ActivityTimeline } from "./ActivityTimeline";
import { ACTIVITY_LOOKBACK_DAYS } from "../utils/constants";

interface JiraActivityProps {
  activities: ActivityItem[];
  loading: boolean;
}

export const JiraActivity: React.FC<JiraActivityProps> = ({ activities, loading }) => {
  const jiraActivities = useMemo(() => activities.filter((a) => a.type === "jira"), [activities]);

  return (
    <ActivityTimeline
      activities={jiraActivities}
      loading={loading}
      emptyMessage={`No JIRA activity in the last ${ACTIVITY_LOOKBACK_DAYS} days`}
    />
  );
};
