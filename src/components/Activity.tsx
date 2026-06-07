import React, { useMemo } from "react";
import { ActivityItem } from "../services/activity";
import { ActivityTimeline } from "./ActivityTimeline";
import { ACTIVITY_LOOKBACK_DAYS } from "../utils/constants";
import { categorizeAction, ACTION_CATEGORIES } from "../utils/activityCategories";

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
    const countsByDateCat = new Map<string, Map<string, number>>();
    for (const a of githubActivities) {
      const day = a.timestamp.slice(0, 10);
      const cat = categorizeAction(a.action);
      if (!countsByDateCat.has(day)) countsByDateCat.set(day, new Map());
      const dayMap = countsByDateCat.get(day)!;
      dayMap.set(cat, (dayMap.get(cat) || 0) + 1);
    }

    const colorMap = new Map(ACTION_CATEGORIES.map((c) => [c.label, c.color]));

    const days: {
      date: string;
      count: number;
      segments: { category: string; count: number; color: string }[];
    }[] = [];
    const now = new Date();
    for (let i = ACTIVITY_LOOKBACK_DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayCats = countsByDateCat.get(key);
      const segments: { category: string; count: number; color: string }[] = [];
      let total = 0;
      if (dayCats) {
        for (const [cat, count] of dayCats) {
          segments.push({ category: cat, count, color: colorMap.get(cat) || "#656d76" });
          total += count;
        }
      }
      days.push({ date: key, count: total, segments });
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
