import { describe, it, expect } from "vitest";
import {
  getWeekKey,
  generateWeekKeysInRange,
  formatWeekRange,
  getCompletionTime,
  formatCompletionTime,
  calculateVelocityMetrics,
  VELOCITY_DATE_REGEX,
} from "../jiraHelpers";

describe("getWeekKey", () => {
  it("returns Monday for a Wednesday", () => {
    // 2026-01-07 is a Wednesday, Monday is 2026-01-05
    expect(getWeekKey(new Date("2026-01-07T12:00:00Z"))).toBe("2026-01-05");
  });

  it("returns same day for a Monday", () => {
    expect(getWeekKey(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("returns previous Monday for a Sunday", () => {
    // 2026-01-11 is Sunday, Monday was 2026-01-05
    expect(getWeekKey(new Date("2026-01-11T23:59:59Z"))).toBe("2026-01-05");
  });

  it("handles month boundary", () => {
    // 2026-02-01 is Sunday, Monday was 2026-01-26
    expect(getWeekKey(new Date("2026-02-01T00:00:00Z"))).toBe("2026-01-26");
  });

  it("handles year boundary", () => {
    // 2026-01-01 is Thursday, Monday was 2025-12-29
    expect(getWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12-29");
  });

  it("handles Saturday", () => {
    // 2026-01-10 is Saturday, Monday was 2026-01-05
    expect(getWeekKey(new Date("2026-01-10T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("generateWeekKeysInRange", () => {
  it("generates weeks for a single month", () => {
    const weeks = generateWeekKeysInRange("2026-01-01", "2026-01-31");
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks[0]).toBe("2025-12-29"); // Monday before Jan 1
    expect(weeks[weeks.length - 1]).toBe("2026-01-26");
  });

  it("returns single week for narrow range", () => {
    const weeks = generateWeekKeysInRange("2026-01-05", "2026-01-11");
    expect(weeks).toEqual(["2026-01-05"]);
  });

  it("handles cross-month range", () => {
    const weeks = generateWeekKeysInRange("2026-01-26", "2026-02-08");
    expect(weeks).toContain("2026-01-26");
    expect(weeks).toContain("2026-02-02");
  });

  it("returns empty for end before start after alignment", () => {
    // Range so narrow it might not contain a Monday
    const weeks = generateWeekKeysInRange("2026-01-06", "2026-01-04");
    expect(weeks).toEqual([]);
  });
});

describe("formatWeekRange", () => {
  it("formats a normal week", () => {
    const result = formatWeekRange("2026-01-05");
    expect(result).toMatch(/Jan 05.*Jan 11/);
  });

  it("handles month crossover", () => {
    const result = formatWeekRange("2026-01-26");
    expect(result).toMatch(/Jan 26.*Feb 01/);
  });

  it("handles year crossover", () => {
    const result = formatWeekRange("2025-12-29");
    expect(result).toMatch(/Dec 29.*Jan 04/);
  });
});

describe("getCompletionTime", () => {
  it("returns days between created and resolved", () => {
    const issue = {
      fields: {
        created: "2026-01-05T00:00:00Z",
        resolutiondate: "2026-01-12T00:00:00Z",
      },
    };
    expect(getCompletionTime(issue)).toBe(7);
  });

  it("returns 0 for same-day resolution", () => {
    const issue = {
      fields: {
        created: "2026-01-05T10:00:00Z",
        resolutiondate: "2026-01-05T10:00:00Z",
      },
    };
    expect(getCompletionTime(issue)).toBe(0);
  });

  it("returns 0 when resolved before created (clamps negative)", () => {
    const issue = {
      fields: {
        created: "2026-01-12T00:00:00Z",
        resolutiondate: "2026-01-05T00:00:00Z",
      },
    };
    expect(getCompletionTime(issue)).toBe(0);
  });

  it("handles missing fields gracefully", () => {
    expect(getCompletionTime({})).toBe(0);
    expect(getCompletionTime({ fields: {} })).toBe(0);
  });
});

describe("formatCompletionTime", () => {
  it("formats sub-day as hours", () => {
    expect(formatCompletionTime(0.5)).toEqual({ value: "12h", days: 0.5 });
  });

  it("shows minimum 1h for very short durations", () => {
    expect(formatCompletionTime(0.01)).toEqual({ value: "1h", days: 0.01 });
  });

  it("formats exactly 1 day", () => {
    expect(formatCompletionTime(1)).toEqual({ value: "1d", days: 1 });
  });

  it("rounds up partial days", () => {
    expect(formatCompletionTime(1.1)).toEqual({ value: "2d", days: 1.1 });
  });

  it("formats multi-day durations", () => {
    expect(formatCompletionTime(7)).toEqual({ value: "7d", days: 7 });
  });

  it("formats zero as 1h", () => {
    expect(formatCompletionTime(0)).toEqual({ value: "1h", days: 0 });
  });
});

describe("VELOCITY_DATE_REGEX", () => {
  it("accepts valid YYYY-MM-DD", () => {
    expect(VELOCITY_DATE_REGEX.test("2026-01-05")).toBe(true);
    expect(VELOCITY_DATE_REGEX.test("2025-12-31")).toBe(true);
  });

  it("rejects JQL injection attempts", () => {
    expect(VELOCITY_DATE_REGEX.test('2026-01-01" OR 1=1 --')).toBe(false);
    expect(VELOCITY_DATE_REGEX.test("2026-01-01; DROP TABLE")).toBe(false);
    expect(VELOCITY_DATE_REGEX.test("")).toBe(false);
    expect(VELOCITY_DATE_REGEX.test("not-a-date")).toBe(false);
  });

  it("rejects partial dates", () => {
    expect(VELOCITY_DATE_REGEX.test("2026-01")).toBe(false);
    expect(VELOCITY_DATE_REGEX.test("2026")).toBe(false);
    expect(VELOCITY_DATE_REGEX.test("01-05-2026")).toBe(false);
  });
});

describe("calculateVelocityMetrics", () => {
  function makeIssue(key: string, created: string, resolved: string, sp?: number) {
    return {
      key,
      fields: {
        created,
        resolutiondate: resolved,
        ...(sp !== undefined ? { customfield_sp: sp } : {}),
      },
    };
  }

  it("returns zeroed metrics for empty issues", () => {
    const result = calculateVelocityMetrics([], "2026-01-05", "2026-01-25");
    expect(result.totalCompleted).toBe(0);
    expect(result.totalStoryPoints).toBe(0);
    expect(result.velocity.trend).toBe("stable");
    expect(result.velocity.tasksPerWeek).toBe(0);
  });

  it("calculates completion time stats", () => {
    const issues = [
      makeIssue("PROJ-1", "2026-01-05T00:00:00Z", "2026-01-12T00:00:00Z"),
      makeIssue("PROJ-2", "2026-01-05T00:00:00Z", "2026-01-19T00:00:00Z"),
    ];
    const result = calculateVelocityMetrics(issues, "2026-01-05", "2026-01-25");
    expect(result.totalCompleted).toBe(2);
    expect(result.averageCompletionTime.fastestDays).toBe(7);
    expect(result.averageCompletionTime.slowestDays).toBe(14);
    expect(result.averageCompletionTime.meanDays).toBe(10.5);
    expect(result.averageCompletionTime.medianDays).toBe(10.5);
  });

  it("calculates median correctly for odd-length arrays", () => {
    const issues = [
      makeIssue("PROJ-1", "2026-01-05T00:00:00Z", "2026-01-07T00:00:00Z"),
      makeIssue("PROJ-2", "2026-01-05T00:00:00Z", "2026-01-12T00:00:00Z"),
      makeIssue("PROJ-3", "2026-01-05T00:00:00Z", "2026-01-19T00:00:00Z"),
    ];
    const result = calculateVelocityMetrics(issues, "2026-01-05", "2026-01-25");
    expect(result.averageCompletionTime.medianDays).toBe(7);
  });

  it("groups issues into correct weeks", () => {
    const issues = [
      makeIssue("PROJ-1", "2026-01-01T00:00:00Z", "2026-01-07T00:00:00Z"),
      makeIssue("PROJ-2", "2026-01-01T00:00:00Z", "2026-01-08T00:00:00Z"),
      makeIssue("PROJ-3", "2026-01-01T00:00:00Z", "2026-01-14T00:00:00Z"),
    ];
    const result = calculateVelocityMetrics(issues, "2026-01-05", "2026-01-18");
    const weeks = result.completionsByWeek;
    expect(weeks.length).toBeGreaterThan(0);
    const totalCount = weeks.reduce((s: number, w: any) => s + w.count, 0);
    expect(totalCount).toBe(3);
  });

  it("detects improving trend when recent half has more completions", () => {
    const issues = [
      makeIssue("OLD-1", "2025-12-01T00:00:00Z", "2026-01-07T00:00:00Z"),
      makeIssue("NEW-1", "2025-12-01T00:00:00Z", "2026-01-14T00:00:00Z"),
      makeIssue("NEW-2", "2025-12-01T00:00:00Z", "2026-01-15T00:00:00Z"),
      makeIssue("NEW-3", "2025-12-01T00:00:00Z", "2026-01-16T00:00:00Z"),
    ];
    const result = calculateVelocityMetrics(issues, "2026-01-05", "2026-01-18");
    expect(result.velocity.trend).toBe("improving");
    expect(result.velocity.trendPercentage).toBeGreaterThan(10);
  });

  it("tracks story points when spFieldId provided", () => {
    const issues = [
      makeIssue("SP-1", "2026-01-05T00:00:00Z", "2026-01-12T00:00:00Z", 3),
      makeIssue("SP-2", "2026-01-05T00:00:00Z", "2026-01-12T00:00:00Z", 5),
    ];
    const result = calculateVelocityMetrics(issues, "2026-01-05", "2026-01-18", "customfield_sp");
    expect(result.totalStoryPoints).toBe(8);
    expect(result.storyPointsPerWeek).toBeGreaterThan(0);
  });

  it("includes period in output", () => {
    const result = calculateVelocityMetrics([], "2026-01-05", "2026-07-12");
    expect(result.period).toEqual({ startDate: "2026-01-05", endDate: "2026-07-12" });
  });
});
