import { describe, it, expect } from "vitest";
import {
  getWeekKey,
  generateWeekKeysInRange,
  formatWeekRange,
  getCompletionTime,
  formatCompletionTime,
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
