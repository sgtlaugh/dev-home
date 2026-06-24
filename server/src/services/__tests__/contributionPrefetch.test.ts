import { describe, it, expect } from "vitest";
import { formatEta } from "../contributionPrefetch";

describe("formatEta", () => {
  it("formats seconds", () => {
    expect(formatEta(30)).toBe("30s");
    expect(formatEta(59)).toBe("59s");
  });

  it("formats minutes", () => {
    expect(formatEta(60)).toBe("1m");
    expect(formatEta(150)).toBe("3m");
    expect(formatEta(3599)).toBe("60m");
  });

  it("formats hours and minutes", () => {
    expect(formatEta(3600)).toBe("1h0m");
    expect(formatEta(3660)).toBe("1h1m");
    expect(formatEta(7200)).toBe("2h0m");
    expect(formatEta(5430)).toBe("1h31m");
  });

  it("rounds fractional seconds", () => {
    expect(formatEta(0.4)).toBe("0s");
    expect(formatEta(0.6)).toBe("1s");
  });
});
