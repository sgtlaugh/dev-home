import React, { useMemo } from "react";
import { ActivityItem } from "../services/activity";
import { ActivityTimeline } from "./ActivityTimeline";
import { ACTIVITY_LOOKBACK_DAYS } from "../utils/constants";
import { categorizeAction } from "../utils/activityCategories";

interface ActivityProps {
  activities: ActivityItem[];
  loading: boolean;
}

export const Activity: React.FC<ActivityProps> = ({ activities, loading }) => {
  const githubActivities = useMemo(
    () => activities.filter((a) => a.type === "github"),
    [activities],
  );

  return (
    <ActivityTimeline
      activities={githubActivities}
      loading={loading}
      emptyMessage={`No GitHub activity in the last ${ACTIVITY_LOOKBACK_DAYS} days`}
    />
  );
};
