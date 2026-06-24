import { describe, it, expect } from "vitest";
import { isFullMonth, getMonthsBetween } from "../contributionCache";

describe("isFullMonth", () => {
  it("returns true when range fully contains the month", () => {
    expect(isFullMonth("2026-01-01", "2026-01-31", "2026-01")).toBe(true);
  });

  it("returns true when range extends beyond the month", () => {
    expect(isFullMonth("2025-12-15", "2026-02-15", "2026-01")).toBe(true);
  });

  it("returns false when start is after month start", () => {
    expect(isFullMonth("2026-01-05", "2026-01-31", "2026-01")).toBe(false);
  });

  it("returns false when end is before month end", () => {
    expect(isFullMonth("2026-01-01", "2026-01-28", "2026-01")).toBe(false);
  });

  it("handles February (28 days in non-leap year)", () => {
    expect(isFullMonth("2026-02-01", "2026-02-28", "2026-02")).toBe(true);
  });

  it("handles February (29 days in leap year)", () => {
    expect(isFullMonth("2028-02-01", "2028-02-29", "2028-02")).toBe(true);
    expect(isFullMonth("2028-02-01", "2028-02-28", "2028-02")).toBe(false);
  });

  it("handles months with 30 days", () => {
    expect(isFullMonth("2026-04-01", "2026-04-30", "2026-04")).toBe(true);
    expect(isFullMonth("2026-04-01", "2026-04-29", "2026-04")).toBe(false);
  });
});

describe("getMonthsBetween", () => {
  it("returns single month for same-month range", () => {
    expect(getMonthsBetween("2026-01-05", "2026-01-20")).toEqual(["2026-01"]);
  });

  it("returns consecutive months", () => {
    expect(getMonthsBetween("2026-01-01", "2026-03-31")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("handles year crossover", () => {
    expect(getMonthsBetween("2025-11-01", "2026-02-28")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("handles multi-year range", () => {
    const months = getMonthsBetween("2025-06-01", "2026-06-30");
    expect(months).toHaveLength(13);
    expect(months[0]).toBe("2025-06");
    expect(months[12]).toBe("2026-06");
  });

  it("pads month numbers to two digits", () => {
    const months = getMonthsBetween("2026-01-01", "2026-09-30");
    expect(months.every((m) => /^\d{4}-\d{2}$/.test(m))).toBe(true);
  });
});
