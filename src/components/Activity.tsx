import React, { useMemo } from "react";
import { ActivityItem } from "../services/activity";
import { ActivityTimeline } from "./ActivityTimeline";
import { ACTIVITY_LOOKBACK_DAYS } from "../utils/constants";

interface ActivityProps {
  activities: ActivityItem[];
  loading: boolean;
}

export const Activity: React.FC<ActivityProps> = ({ activities, loading }) => {
  const githubActivities = useMemo(
    () => activities.filter((a) => a.type === "github"),
    [activities],
  );

  const dailyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of githubActivities) {
      const day = a.timestamp.slice(0, 10);
      counts.set(day, (counts.get(day) || 0) + 1);
    }

    const days: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = ACTIVITY_LOOKBACK_DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: counts.get(key) || 0 });
    }
    return days;
  }, [githubActivities]);

  return (
    <ActivityTimeline
      activities={githubActivities}
      loading={loading}
      emptyMessage={`No GitHub activity in the last ${ACTIVITY_LOOKBACK_DAYS} days`}
      dailyCounts={dailyCounts}
    />
  );
};
