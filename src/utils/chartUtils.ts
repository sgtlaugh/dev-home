import { DateMode } from "../components/DateControls";

export function getYTicks(max: number): number[] {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const targetTicks = 4;
  let step = 1;
  for (const s of steps) {
    if (max / s <= targetTicks) {
      step = s;
      break;
    }
  }
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) {
    ticks.push(v);
  }
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export function getHeatmapLevel(count: number, inRange: boolean): number {
  if (!inRange) return 0;
  if (count === 0) return 1;
  if (count <= 1) return 2;
  if (count <= 2) return 3;
  if (count <= 4) return 4;
  return 5;
}

export function getHeatmapDisplayRange(
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
