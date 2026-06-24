import { describe, it, expect } from "vitest";
import { computeStreak } from "../ActivityBarChart";

describe("computeStreak", () => {
  it("counts consecutive active days from end", () => {
    const days = [
      { date: "2026-01-01", count: 0 },
      { date: "2026-01-02", count: 3 },
      { date: "2026-01-03", count: 1 },
      { date: "2026-01-04", count: 2 },
      { date: "2026-01-05", count: 1 },
    ];
    expect(computeStreak(days, "2026-01-05")).toBe(4);
  });

  it("returns 0 when last day has no activity", () => {
    const days = [
      { date: "2026-01-04", count: 3 },
      { date: "2026-01-05", count: 0 },
    ];
    expect(computeStreak(days, "2026-01-06")).toBe(0);
  });

  it("skips today if it has zero count (day not over yet)", () => {
    const days = [
      { date: "2026-01-03", count: 2 },
      { date: "2026-01-04", count: 1 },
      { date: "2026-01-05", count: 0 },
    ];
    expect(computeStreak(days, "2026-01-05")).toBe(2);
  });

  it("includes today if it has activity", () => {
    const days = [
      { date: "2026-01-04", count: 1 },
      { date: "2026-01-05", count: 3 },
    ];
    expect(computeStreak(days, "2026-01-05")).toBe(2);
  });

  it("returns 0 for empty array", () => {
    expect(computeStreak([], "2026-01-05")).toBe(0);
  });

  it("returns 1 for single active day", () => {
    const days = [{ date: "2026-01-05", count: 1 }];
    expect(computeStreak(days, "2026-01-05")).toBe(1);
  });

  it("breaks streak at zero-count gap", () => {
    const days = [
      { date: "2026-01-01", count: 5 },
      { date: "2026-01-02", count: 0 },
      { date: "2026-01-03", count: 1 },
      { date: "2026-01-04", count: 2 },
    ];
    expect(computeStreak(days, "2026-01-04")).toBe(2);
  });
});
