import React, { useMemo } from "react";
import { ACTION_CATEGORIES } from "../utils/activityCategories";
import { getLocalDateString } from "../utils/dateUtils";
import { Tooltip } from "./Tooltip";

interface Segment {
  category: string;
  count: number;
  color: string;
}

export interface DailyCount {
  date: string;
  count: number;
  segments: Segment[];
}

interface ActivityBarChartProps {
  dailyCounts: DailyCount[];
  activities?: { timestamp: string; action: string }[];
}

function getMonthLabels(days: DailyCount[]): { label: string; index: number }[] {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const labels: { label: string; index: number }[] = [];
  let lastMonth = -1;

  for (let i = 0; i < days.length; i++) {
    const month = parseInt(days[i].date.split("-")[1], 10) - 1;
    if (month !== lastMonth) {
      labels.push({ label: monthNames[month], index: i });
      lastMonth = month;
    }
  }

  return labels;
}

export function computeStreak(days: { count: number; date: string }[]): number {
  const today = getLocalDateString();
  const lastIdx = days.length - 1;
  let startIdx = lastIdx;
  if (days[lastIdx]?.date === today && days[lastIdx]?.count === 0) {
    startIdx = lastIdx - 1;
  }
  let current = 0;
  for (let i = startIdx; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else break;
  }
  return current;
}

const DARK_COLORS: Record<string, string> = Object.fromEntries(
  ACTION_CATEGORIES.map((c) => [c.color, c.darkColor]),
);

export const ActivityBarChart: React.FC<ActivityBarChartProps> = ({ dailyCounts, activities }) => {
  const monthLabels = useMemo(() => getMonthLabels(dailyCounts), [dailyCounts]);

  const hourCounts = useMemo(() => {
    if (!activities || activities.length === 0) return null;
    const counts = new Array(24).fill(0);
    for (const a of activities) {
      const localHour = new Date(a.timestamp).getHours();
      counts[localHour]++;
    }
    return counts as number[];
  }, [activities]);

  if (dailyCounts.length === 0) return null;

  const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1);
  const today = getLocalDateString();

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const maxHour = hourCounts ? Math.max(...hourCounts, 1) : 1;

  return (
    <div className="activity-bar-chart">
      <div className="activity-bar-chart-bars">
        {dailyCounts.map((day) => {
          const isToday = day.date === today;
          const isEmpty = day.count === 0;
          const isMax = day.count === maxCount && maxCount > 0;
          const barHeight = isEmpty ? 0 : Math.max((day.count / maxCount) * 100, 12);

          const tooltipText = isEmpty
            ? `No activity · ${formatDate(day.date)}`
            : `${day.count} activit${day.count === 1 ? "y" : "ies"} · ${formatDate(day.date)}`;

          return (
            <div key={day.date} className="activity-bar-wrapper">
              <Tooltip text={tooltipText}>
                <div
                  className="activity-bar-stacked"
                  style={{ height: isEmpty ? "4px" : `${barHeight}%` }}
                >
                  {isEmpty ? (
                    <div className="activity-bar-empty-segment" />
                  ) : (
                    day.segments.map((seg, idx) => (
                      <div
                        key={idx}
                        style={{
                          flex: seg.count,
                          backgroundColor: isMax ? DARK_COLORS[seg.color] || seg.color : seg.color,
                          opacity: isMax ? 1 : 0.75,
                          borderRadius:
                            idx === 0 && idx === day.segments.length - 1
                              ? "2px 2px 0 0"
                              : idx === 0
                                ? "2px 2px 0 0"
                                : undefined,
                        }}
                      />
                    ))
                  )}
                  {isToday && !isEmpty && <div className="activity-bar-today-dot" />}
                </div>
              </Tooltip>
              {isToday && isEmpty && (
                <div className="activity-bar-today-dot" style={{ bottom: "6px" }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="activity-bar-chart-labels">
        {monthLabels.map((ml) => (
          <span
            key={ml.index}
            style={{
              position: "absolute",
              left: `${(ml.index / dailyCounts.length) * 100}%`,
            }}
          >
            {ml.label}
          </span>
        ))}
      </div>

      {/* Time-of-day bar chart */}
      {hourCounts && maxHour > 0 && (
        <div className="activity-hour-heatmap">
          <div className="activity-hour-grid">
            {hourCounts.map((count, hour) => {
              const label = String(hour).padStart(2, "0");
              const isEmpty = count === 0;
              const isMax = count === maxHour;
              return (
                <div key={hour} className="activity-bar-wrapper">
                  <Tooltip
                    text={`${count} activit${count === 1 ? "y" : "ies"} during ${label}:00-${String((hour + 1) % 24).padStart(2, "0")}:00`}
                  >
                    <div
                      className={`activity-hour-bar${isEmpty ? " activity-bar-empty-segment" : ""}${isMax ? " activity-hour-bar-max" : ""}`}
                      style={{
                        height: isEmpty ? "4px" : `${Math.max((count / maxHour) * 100, 12)}%`,
                      }}
                    />
                  </Tooltip>
                </div>
              );
            })}
          </div>
          <div className="activity-hour-labels">
            {hourCounts.map((_, hour) => (
              <span
                key={hour}
                style={{
                  position: "absolute",
                  left: `${((hour + 0.5) / 24) * 100}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
