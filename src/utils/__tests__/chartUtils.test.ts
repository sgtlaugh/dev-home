import { describe, it, expect } from "vitest";
import { getYTicks, getHeatmapLevel, getHeatmapDisplayRange } from "../chartUtils";

describe("getYTicks", () => {
  it("returns [0, 1] for max=1", () => {
    expect(getYTicks(1)).toEqual([0, 1]);
  });

  it("returns ticks with step=1 for small max", () => {
    expect(getYTicks(4)).toEqual([0, 1, 2, 3, 4]);
  });

  it("uses step=2 when max exceeds 4 with step 1", () => {
    const ticks = getYTicks(7);
    expect(ticks).toEqual([0, 2, 4, 6, 8]);
  });

  it("uses step=5 for larger max", () => {
    const ticks = getYTicks(18);
    expect(ticks).toEqual([0, 5, 10, 15, 20]);
  });

  it("appends extra tick when max not evenly divisible", () => {
    const ticks = getYTicks(3);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(3);
  });

  it("handles max=0", () => {
    expect(getYTicks(0)).toEqual([0]);
  });

  it("handles large max values", () => {
    const ticks = getYTicks(1500);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1500);
    expect(ticks.length).toBeLessThanOrEqual(6);
  });
});

describe("getHeatmapLevel", () => {
  it("returns 0 when not in range", () => {
    expect(getHeatmapLevel(5, false)).toBe(0);
    expect(getHeatmapLevel(0, false)).toBe(0);
  });

  it("returns 1 for zero count in range", () => {
    expect(getHeatmapLevel(0, true)).toBe(1);
  });

  it("returns correct levels for count thresholds", () => {
    expect(getHeatmapLevel(1, true)).toBe(2);
    expect(getHeatmapLevel(2, true)).toBe(3);
    expect(getHeatmapLevel(4, true)).toBe(4);
    expect(getHeatmapLevel(5, true)).toBe(5);
    expect(getHeatmapLevel(100, true)).toBe(5);
  });
});

describe("getHeatmapDisplayRange", () => {
  it("returns full year for year mode", () => {
    const { start, end } = getHeatmapDisplayRange("year", 2026, 1, []);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
  });

  it("returns year-forward from month start for month mode", () => {
    const { start, end } = getHeatmapDisplayRange("month", 2026, 5, []);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(4);
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(3);
    expect(end.getDate()).toBe(30);
  });

  it("returns year-forward from min date for custom mode with short range", () => {
    const dates = [new Date(2026, 0, 5).getTime(), new Date(2026, 2, 10).getTime()];
    const { start, end } = getHeatmapDisplayRange("custom", 2026, 1, dates);
    expect(start.getTime()).toBe(dates[0]);
    expect(end.getFullYear()).toBe(2027);
  });

  it("returns exact range for custom mode with multi-year span", () => {
    const dates = [new Date(2024, 0, 1).getTime(), new Date(2026, 11, 31).getTime()];
    const { start, end } = getHeatmapDisplayRange("custom", 2026, 1, dates);
    expect(start.getTime()).toBe(dates[0]);
    expect(end.getTime()).toBe(dates[1]);
  });

  it("returns today for custom mode with no dates", () => {
    const { start, end } = getHeatmapDisplayRange("custom", 2026, 1, []);
    const now = new Date();
    expect(start.getDate()).toBe(now.getDate());
    expect(end.getDate()).toBe(now.getDate());
  });
});
