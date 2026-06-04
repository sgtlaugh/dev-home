import React, { useMemo, useState } from "react";

interface DailyCount {
  date: string;
  count: number;
}

interface ActivityBarChartProps {
  dailyCounts: DailyCount[];
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

export const ActivityBarChart: React.FC<ActivityBarChartProps> = ({ dailyCounts }) => {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const monthLabels = useMemo(() => getMonthLabels(dailyCounts), [dailyCounts]);

  if (dailyCounts.length === 0) return null;

  const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1);
  const today = new Date().toISOString().slice(0, 10);

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="activity-bar-chart">
      <div className="activity-bar-chart-bars">
        {dailyCounts.map((day) => {
          const isToday = day.date === today;
          const isEmpty = day.count === 0;

          return (
            <div key={day.date} className={`activity-bar-wrapper`}>
              <div
                className={`activity-bar${isToday ? " activity-bar-today" : ""}${isEmpty ? " activity-bar-empty" : ""}`}
                style={
                  isEmpty ? undefined : { height: `${Math.max((day.count / maxCount) * 100, 12)}%` }
                }
                onMouseEnter={(e) => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  setTooltip({
                    text: isEmpty
                      ? `No activity on ${formatDate(day.date)}`
                      : `${day.count} activit${day.count === 1 ? "y" : "ies"} on ${formatDate(day.date)}`,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
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
      {tooltip && (
        <div
          className="heatmap-tooltip"
          data-below="false"
          style={{
            position: "fixed",
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};
