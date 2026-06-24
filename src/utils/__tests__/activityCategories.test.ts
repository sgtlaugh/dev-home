import { describe, it, expect } from "vitest";
import {
  getActionConfig,
  getActionPriority,
  getActionBadgeClass,
  categorizeAction,
  getFilterCategories,
  getBadgeColor,
} from "../activityCategories";

describe("getActionConfig", () => {
  it("matches exact action names", () => {
    expect(getActionConfig("Created PR").action).toBe("Created PR");
    expect(getActionConfig("Merged PR").action).toBe("Merged PR");
  });

  it("matches actions containing keywords", () => {
    expect(getActionConfig("Approved PR").action).toBe("Approved PR");
    expect(getActionConfig("Commented on PR").action).toBe("Commented");
    expect(getActionConfig("Committed code").action).toBe("Committed");
  });

  it("returns default config for unknown actions", () => {
    const config = getActionConfig("Unknown action");
    expect(config.action).toBe("Other");
    expect(config.priority).toBe(99);
  });

  it("Created PR matches before Created ticket", () => {
    const config = getActionConfig("Created PR");
    expect(config.action).toBe("Created PR");
    expect(config.priority).toBe(0);
  });

  it("matches Changes Requested", () => {
    expect(getActionConfig("Changes Requested").action).toBe("Changes Requested");
  });

  it("matches status changes", () => {
    expect(getActionConfig("Changed status to Done").action).toBe("Changed status");
  });
});

describe("getActionPriority", () => {
  it("Created PR has highest priority (0)", () => {
    expect(getActionPriority("Created PR")).toBe(0);
  });

  it("Committed has lower priority than Created", () => {
    expect(getActionPriority("Committed")).toBeGreaterThan(getActionPriority("Created PR"));
  });

  it("unknown actions get priority 99", () => {
    expect(getActionPriority("Something weird")).toBe(99);
  });
});

describe("getActionBadgeClass", () => {
  it("returns correct badge classes", () => {
    expect(getActionBadgeClass("Created PR")).toBe("badge-status-green-dark");
    expect(getActionBadgeClass("Merged PR")).toBe("badge-status-purple-dark");
    expect(getActionBadgeClass("Committed")).toBe("badge-status-green-light");
    expect(getActionBadgeClass("Commented on issue")).toBe("badge-status-blue");
  });

  it("returns neutral for unknown", () => {
    expect(getActionBadgeClass("Unknown")).toBe("badge-status-neutral");
  });
});

describe("categorizeAction", () => {
  it("maps actions to filter labels", () => {
    expect(categorizeAction("Created PR")).toBe("Created");
    expect(categorizeAction("Merged PR")).toBe("Merged");
    expect(categorizeAction("Approved PR")).toBe("Approved");
    expect(categorizeAction("Commented on PR")).toBe("Comments");
    expect(categorizeAction("Committed code")).toBe("Commits");
    expect(categorizeAction("Changes Requested")).toBe("Changes Requested");
    expect(categorizeAction("Changed status to In Progress")).toBe("Changed status");
  });

  it("returns 'Other' for unknown actions", () => {
    expect(categorizeAction("Unknown")).toBe("Other");
  });

  it("Created ticket maps to Created ticket label", () => {
    expect(categorizeAction("Created ticket")).toBe("Created ticket");
  });
});

describe("getFilterCategories", () => {
  it("returns non-empty list with required fields", () => {
    const categories = getFilterCategories();
    expect(categories.length).toBeGreaterThan(0);
    for (const cat of categories) {
      expect(cat.label).toBeTruthy();
      expect(cat.color).toMatch(/^#/);
      expect(cat.darkColor).toMatch(/^#/);
    }
  });

  it("includes expected categories", () => {
    const labels = getFilterCategories().map((c) => c.label);
    expect(labels).toContain("Created");
    expect(labels).toContain("Merged");
    expect(labels).toContain("Commits");
    expect(labels).toContain("Comments");
  });
});

describe("getBadgeColor", () => {
  it("returns hex color for known badge classes", () => {
    expect(getBadgeColor("badge-status-green-light")).toBe("#1a7f37");
    expect(getBadgeColor("badge-status-blue")).toBe("#0969da");
  });

  it("returns default color for unknown class", () => {
    expect(getBadgeColor("nonexistent")).toBe("#d1d9e0");
  });
});
