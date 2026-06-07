import React, { useMemo, useState } from "react";
import { GitHubPR } from "../types";
import { DateMode } from "./Contributions";

function getHeatmapLevel(count: number, inRange: boolean): number {
  if (!inRange) return 0;
  if (count === 0) return 1;
  if (count <= 1) return 2;
  if (count <= 2) return 3;
  if (count <= 4) return 4;
  return 5;
}

function getHeatmapDisplayRange(
  mode: DateMode,
  year: number,
  month: number,
  prDates: number[],
): { start: Date; end: Date } {
  if (mode === "year") {
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }
  if (mode === "month") {
    const start = new Date(year, month - 1, 1);
    const yearForward = new Date(start);
    yearForward.setFullYear(yearForward.getFullYear() + 1);
    yearForward.setDate(yearForward.getDate() - 1);
    return { start, end: yearForward };
  }
  if (prDates.length === 0) return { start: new Date(), end: new Date() };
  const minDate = new Date(Math.min(...prDates));
  const maxDate = new Date(Math.max(...prDates));
  const rangeMs = maxDate.getTime() - minDate.getTime();
  const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;

  if (rangeMs < oneYearMs) {
    const yearForward = new Date(minDate);
    yearForward.setFullYear(yearForward.getFullYear() + 1);
    yearForward.setDate(yearForward.getDate() - 1);
    return { start: minDate, end: yearForward };
  }
  return { start: minDate, end: maxDate };
}

function getMonthLabels(
  cells: { date: string; dayOfWeek: number }[],
): { label: string; col: number }[] {
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
  const labels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  let lastCol = -1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].dayOfWeek !== 0) continue;
    const [, m] = cells[i].date.split("-").map(Number);
    const col = Math.floor(i / 7);
    if (m !== lastMonth && col - lastCol >= 2) {
      labels.push({ label: monthNames[m - 1], col });
      lastMonth = m;
      lastCol = col;
    }
  }
  return labels;
}

interface ContributionHeatmapProps {
  prs: GitHubPR[];
  mode: DateMode;
  year: number;
  month: number;
  selectedStart: string;
  selectedEnd: string;
}

export function ContributionHeatmap({
  prs,
  mode,
  year,
  month,
  selectedStart,
  selectedEnd,
}: ContributionHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);

  const { cells, monthLabels } = useMemo(() => {
    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const countByDate = new Map<string, number>();
    for (const pr of prs) {
      const d = toLocalDateStr(new Date(pr.created_at));
      countByDate.set(d, (countByDate.get(d) || 0) + 1);
    }

    if (prs.length === 0 && mode === "custom") return { cells: [], monthLabels: [] };

    const prDates = prs.map((p) => new Date(p.created_at).getTime());
    const { start: displayStartDate, end: displayEndDate } = getHeatmapDisplayRange(
      mode,
      year,
      month,
      prDates,
    );
    const selectedStartDate = new Date(selectedStart);
    const selectedEndDate = new Date(selectedEnd);

    const aligned = new Date(displayStartDate);
    aligned.setDate(aligned.getDate() - aligned.getDay());

    const gridCells: { date: string; count: number; dayOfWeek: number; inRange: boolean }[] = [];
    const d = new Date(aligned);
    while (d <= displayEndDate || d.getDay() !== 0) {
      const key = toLocalDateStr(d);
      const inRange = d >= selectedStartDate && d <= selectedEndDate;
      gridCells.push({
        date: key,
        count: inRange ? countByDate.get(key) || 0 : 0,
        dayOfWeek: d.getDay(),
        inRange,
      });
      d.setDate(d.getDate() + 1);
    }

    const monthLabels = getMonthLabels(gridCells);
    return { cells: gridCells, monthLabels };
  }, [prs, mode, year, month, selectedStart, selectedEnd]);

  if (cells.length === 0) return null;

  const totalWeeks = Math.ceil(cells.length / 7);
  const dayLabels = ["Sun", "", "Tue", "", "Thu", "", "Sat"];

  return (
    <div className="heatmap-container">
      {monthLabels.length > 0 && (
        <div
          className="heatmap-month-labels"
          style={{ position: "relative", height: "16px", marginLeft: "24px" }}
        >
          {monthLabels.map((ml, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: ml.col * 16,
              }}
            >
              {ml.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex" }}>
        <div className="heatmap-day-labels">
          {dayLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div className="heatmap-grid">
          {cells.map((cell, i) => {
            const level = getHeatmapLevel(cell.count, cell.inRange);
            const formatDate = (dateStr: string) => {
              const [year, month, day] = dateStr.split("-");
              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
            };

            const tooltipText = cell.inRange
              ? cell.count === 0
                ? `No activity on ${formatDate(cell.date)}`
                : `${cell.count} PR${cell.count !== 1 ? "s" : ""} on ${formatDate(cell.date)}`
              : `Outside range on ${formatDate(cell.date)}`;
            return (
              <div
                key={i}
                className={`heatmap-cell heatmap-cell-${level}`}
                style={level === 0 ? { opacity: 0.3 } : undefined}
                onMouseEnter={(e) => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  const below = rect.top > 60;
                  setTooltip({
                    text: tooltipText,
                    x: rect.left + rect.width / 2,
                    y: below ? rect.bottom + 8 : rect.top - 8,
                    below,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        {[1, 2, 3, 4, 5].map((l) => (
          <div key={l} className={`heatmap-legend-cell heatmap-cell-${l}`} />
        ))}
        <span>More</span>
      </div>
      {tooltip && (
        <div
          className="heatmap-tooltip"
          data-below={tooltip.below}
          style={{
            position: "fixed",
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: tooltip.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
