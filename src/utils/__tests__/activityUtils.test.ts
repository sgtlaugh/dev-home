import { describe, it, expect } from "vitest";
import { getReviewState, collapseActivitiesByEntity, getActionSummaries } from "../activityUtils";
import { ActivityItem } from "../../services/activity";

function makeItem(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: "test-1",
    type: "github",
    action: "Committed",
    title: "Test PR",
    url: "https://github.com/test/repo/pull/1",
    timestamp: "2026-01-05T10:00:00Z",
    entityKey: "test/repo#1",
    ...overrides,
  };
}

describe("getReviewState", () => {
  it("returns undefined for empty array", () => {
    expect(getReviewState([])).toBeUndefined();
  });

  it("returns merged when Merged PR is present", () => {
    const items = [
      makeItem({ action: "Approved PR", timestamp: "2026-01-05T09:00:00Z" }),
      makeItem({ action: "Merged PR", timestamp: "2026-01-05T10:00:00Z" }),
    ];
    expect(getReviewState(items)).toBe("merged");
  });

  it("returns merged even if it appears after other states", () => {
    const items = [makeItem({ action: "Changes Requested" }), makeItem({ action: "Merged PR" })];
    expect(getReviewState(items)).toBe("merged");
  });

  it("returns changes_requested when it appears first (no merge)", () => {
    const items = [makeItem({ action: "Changes Requested" }), makeItem({ action: "Approved PR" })];
    expect(getReviewState(items)).toBe("changes_requested");
  });

  it("returns approved when it appears first (no merge, no changes)", () => {
    const items = [makeItem({ action: "Approved PR" }), makeItem({ action: "Committed" })];
    expect(getReviewState(items)).toBe("approved");
  });

  it("returns undefined when no review actions exist", () => {
    const items = [makeItem({ action: "Committed" }), makeItem({ action: "Commented" })];
    expect(getReviewState(items)).toBeUndefined();
  });
});

describe("collapseActivitiesByEntity", () => {
  it("groups activities by entityKey", () => {
    const activities = [
      makeItem({ id: "1", entityKey: "repo#1", timestamp: "2026-01-05T10:00:00Z" }),
      makeItem({ id: "2", entityKey: "repo#2", timestamp: "2026-01-05T11:00:00Z" }),
      makeItem({ id: "3", entityKey: "repo#1", timestamp: "2026-01-05T12:00:00Z" }),
    ];
    const result = collapseActivitiesByEntity(activities);
    expect(result).toHaveLength(2);
    const repo1 = result.find((r) => r.entityKey === "repo#1");
    expect(repo1?.actions).toHaveLength(2);
  });

  it("picks latest timestamp as lastTimestamp", () => {
    const activities = [
      makeItem({ id: "1", entityKey: "repo#1", timestamp: "2026-01-05T08:00:00Z" }),
      makeItem({ id: "2", entityKey: "repo#1", timestamp: "2026-01-05T14:00:00Z" }),
      makeItem({ id: "3", entityKey: "repo#1", timestamp: "2026-01-05T10:00:00Z" }),
    ];
    const result = collapseActivitiesByEntity(activities);
    expect(result[0].lastTimestamp).toBe("2026-01-05T14:00:00Z");
  });

  it("sorts collapsed groups by lastTimestamp descending", () => {
    const activities = [
      makeItem({ id: "1", entityKey: "repo#1", timestamp: "2026-01-05T08:00:00Z" }),
      makeItem({ id: "2", entityKey: "repo#2", timestamp: "2026-01-05T14:00:00Z" }),
    ];
    const result = collapseActivitiesByEntity(activities);
    expect(result[0].entityKey).toBe("repo#2");
    expect(result[1].entityKey).toBe("repo#1");
  });

  it("sorts actions within a group by timestamp descending", () => {
    const activities = [
      makeItem({ id: "1", entityKey: "repo#1", timestamp: "2026-01-05T08:00:00Z" }),
      makeItem({ id: "2", entityKey: "repo#1", timestamp: "2026-01-05T14:00:00Z" }),
      makeItem({ id: "3", entityKey: "repo#1", timestamp: "2026-01-05T10:00:00Z" }),
    ];
    const result = collapseActivitiesByEntity(activities);
    expect(result[0].actions[0].timestamp).toBe("2026-01-05T14:00:00Z");
    expect(result[0].actions[2].timestamp).toBe("2026-01-05T08:00:00Z");
  });

  it("sets reviewState from sorted actions", () => {
    const activities = [
      makeItem({
        id: "1",
        entityKey: "repo#1",
        action: "Approved PR",
        timestamp: "2026-01-05T08:00:00Z",
      }),
      makeItem({
        id: "2",
        entityKey: "repo#1",
        action: "Changes Requested",
        timestamp: "2026-01-05T14:00:00Z",
      }),
    ];
    const result = collapseActivitiesByEntity(activities);
    // Sorted descending: Changes Requested (14:00) comes first
    expect(result[0].reviewState).toBe("changes_requested");
  });

  it("returns empty array for empty input", () => {
    expect(collapseActivitiesByEntity([])).toEqual([]);
  });
});

describe("getActionSummaries", () => {
  it("deduplicates actions", () => {
    const actions = [
      makeItem({ action: "Committed" }),
      makeItem({ action: "Commented" }),
      makeItem({ action: "Committed" }),
    ];
    const result = getActionSummaries(actions);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.text)).toContain("Committed");
    expect(result.map((r) => r.text)).toContain("Commented");
  });

  it("returns empty array for empty input", () => {
    expect(getActionSummaries([])).toEqual([]);
  });
});
