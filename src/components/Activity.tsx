import React from "react";
import { ActivityItem } from "../services/activity";
import { ActivityTimeline } from "./ActivityTimeline";

interface ActivityProps {
  activities: ActivityItem[];
  loading: boolean;
}

export const Activity: React.FC<ActivityProps> = ({ activities, loading }) => {
  return (
    <ActivityTimeline
      activities={activities}
      loading={loading}
      emptyMessage="No activity in the last 24 hours"
    />
  );
};
