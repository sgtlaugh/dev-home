import { describe, it, expect } from "vitest";
import { getDateKey, formatLocalDate, getLocalDateMinusDays } from "../dateUtils";

describe("getDateKey", () => {
  // Fixed reference: 2026-01-05 at noon
  const noon = new Date("2026-01-05T12:00:00").getTime();

  it("returns Today for same calendar date", () => {
    expect(getDateKey("2026-01-05T08:00:00", noon)).toBe("Today");
    expect(getDateKey("2026-01-05T23:59:59", noon)).toBe("Today");
  });

  it("returns Yesterday for previous calendar date", () => {
    expect(getDateKey("2026-01-04T23:59:59", noon)).toBe("Yesterday");
    expect(getDateKey("2026-01-04T00:00:00", noon)).toBe("Yesterday");
  });

  it("returns formatted date for older dates", () => {
    const result = getDateKey("2026-01-03T12:00:00", noon);
    expect(result).toMatch(/Jan\s+3/);
  });

  it("handles midnight boundary correctly", () => {
    // 11:59 PM on Jan 4 is Yesterday, 12:00 AM on Jan 5 is Today
    const midnight = new Date("2026-01-05T00:00:01").getTime();
    expect(getDateKey("2026-01-04T23:59:59", midnight)).toBe("Yesterday");
    expect(getDateKey("2026-01-05T00:00:00", midnight)).toBe("Today");
  });

  it("does not use hours-based comparison", () => {
    // 11 PM yesterday is less than 24 hours ago, but should be Yesterday
    const tenAM = new Date("2026-01-05T10:00:00").getTime();
    expect(getDateKey("2026-01-04T23:00:00", tenAM)).toBe("Yesterday");
  });
});

describe("formatLocalDate", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("pads single-digit month and day", () => {
    expect(formatLocalDate(new Date(2026, 4, 2))).toBe("2026-05-02");
  });
});

describe("getLocalDateMinusDays", () => {
  it("returns a valid YYYY-MM-DD string", () => {
    const result = getLocalDateMinusDays(7);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
