import { describe, it, expect } from "vitest";
import {
  deriveReviewStatus,
  mapGraphQLPr,
  extractSubjectNumber,
  subjectUrlToHtml,
  isBot,
  extractOwnPRComments,
  buildYearRanges,
  IGNORED_BOTS,
} from "../helpers";

describe("deriveReviewStatus", () => {
  it("returns null for undefined/empty reviews", () => {
    expect(deriveReviewStatus(undefined)).toBeNull();
    expect(deriveReviewStatus([])).toBeNull();
  });

  it("returns CHANGES_REQUESTED when any reviewer requested changes", () => {
    const reviews = [
      { author: { login: "goku" }, state: "APPROVED" },
      { author: { login: "vegeta" }, state: "CHANGES_REQUESTED" },
    ];
    expect(deriveReviewStatus(reviews)).toBe("CHANGES_REQUESTED");
  });

  it("returns APPROVED when all reviewers approved", () => {
    const reviews = [
      { author: { login: "goku" }, state: "APPROVED" },
      { author: { login: "vegeta" }, state: "APPROVED" },
    ];
    expect(deriveReviewStatus(reviews)).toBe("APPROVED");
  });

  it("uses latest review per author (overwrite earlier state)", () => {
    const reviews = [
      { author: { login: "goku" }, state: "CHANGES_REQUESTED" },
      { author: { login: "goku" }, state: "APPROVED" },
    ];
    expect(deriveReviewStatus(reviews)).toBe("APPROVED");
  });

  it("returns REVIEWED for non-approve/non-change states", () => {
    const reviews = [{ author: { login: "goku" }, state: "COMMENTED" }];
    expect(deriveReviewStatus(reviews)).toBe("REVIEWED");
  });

  it("skips reviews with no author login", () => {
    const reviews = [
      { author: {}, state: "APPROVED" },
      { author: { login: "" }, state: "APPROVED" },
    ];
    expect(deriveReviewStatus(reviews)).toBeNull();
  });
});

describe("mapGraphQLPr", () => {
  const minimalNode = {
    databaseId: 42,
    number: 7,
    title: "Add scouter readings",
    url: "https://github.com/capsulecorp/scouters/pull/7",
    state: "OPEN",
    isDraft: false,
    merged: false,
    mergedAt: null,
    closedAt: null,
    createdAt: "2026-01-05T10:00:00Z",
    updatedAt: "2026-01-05T12:00:00Z",
    author: { login: "bulma", avatarUrl: "https://github.com/bulma.png" },
    headRefName: "feat/scouter",
    baseRefName: "main",
    repository: { nameWithOwner: "capsulecorp/scouters" },
    additions: 42,
    deletions: 7,
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
    reviews: { nodes: [] },
  };

  it("maps all fields correctly", () => {
    const pr = mapGraphQLPr(minimalNode);
    expect(pr.id).toBe(42);
    expect(pr.number).toBe(7);
    expect(pr.title).toBe("Add scouter readings");
    expect(pr.state).toBe("open");
    expect(pr.draft).toBe(false);
    expect(pr.merged).toBe(false);
    expect(pr.user.login).toBe("bulma");
    expect(pr.head.ref).toBe("feat/scouter");
    expect(pr.base.ref).toBe("main");
    expect(pr.repo_full_name).toBe("capsulecorp/scouters");
    expect(pr.checks_status).toBe("SUCCESS");
    expect(pr.additions).toBe(42);
    expect(pr.deletions).toBe(7);
  });

  it("handles missing author gracefully", () => {
    const pr = mapGraphQLPr({ ...minimalNode, author: null });
    expect(pr.user.login).toBe("");
    expect(pr.user.avatar_url).toBe("");
  });

  it("handles missing commits/rollup", () => {
    const pr = mapGraphQLPr({ ...minimalNode, commits: null });
    expect(pr.checks_status).toBeNull();
  });

  it("derives review_status from reviews", () => {
    const node = {
      ...minimalNode,
      reviews: { nodes: [{ author: { login: "goku" }, state: "APPROVED" }] },
    };
    expect(mapGraphQLPr(node).review_status).toBe("APPROVED");
  });
});

describe("extractSubjectNumber", () => {
  it("extracts trailing number from API URL", () => {
    expect(extractSubjectNumber("https://api.github.com/repos/org/repo/pulls/42")).toBe(42);
    expect(extractSubjectNumber("https://api.github.com/repos/org/repo/issues/7")).toBe(7);
  });

  it("returns null for missing/invalid input", () => {
    expect(extractSubjectNumber(undefined)).toBeNull();
    expect(extractSubjectNumber("")).toBeNull();
    expect(extractSubjectNumber("https://github.com/org/repo")).toBeNull();
  });
});

describe("subjectUrlToHtml", () => {
  it("converts pulls API URL to browser URL", () => {
    expect(
      subjectUrlToHtml(
        "https://api.github.com/repos/capsulecorp/scouters/pulls/7",
        "capsulecorp/scouters",
      ),
    ).toBe("https://github.com/capsulecorp/scouters/pull/7");
  });

  it("converts issues API URL to browser URL", () => {
    expect(
      subjectUrlToHtml(
        "https://api.github.com/repos/capsulecorp/scouters/issues/42",
        "capsulecorp/scouters",
      ),
    ).toBe("https://github.com/capsulecorp/scouters/issues/42");
  });

  it("falls back to repo URL for unrecognized pattern", () => {
    expect(
      subjectUrlToHtml(
        "https://api.github.com/repos/capsulecorp/scouters/commits/abc",
        "capsulecorp/scouters",
      ),
    ).toBe("https://github.com/capsulecorp/scouters");
  });

  it("falls back to repo URL for undefined", () => {
    expect(subjectUrlToHtml(undefined, "capsulecorp/scouters")).toBe(
      "https://github.com/capsulecorp/scouters",
    );
  });
});

describe("isBot", () => {
  it("returns true for empty login", () => {
    expect(isBot("")).toBe(true);
  });

  it("detects [bot] suffix", () => {
    expect(isBot("dependabot[bot]")).toBe(true);
    expect(isBot("some-app[bot]")).toBe(true);
  });

  it("detects known bot names (case-insensitive)", () => {
    for (const bot of IGNORED_BOTS) {
      expect(isBot(bot)).toBe(true);
      expect(isBot(bot.toUpperCase())).toBe(true);
    }
  });

  it("detects bot name as substring", () => {
    expect(isBot("github-actions-bot")).toBe(true);
    expect(isBot("my-dependabot-fork")).toBe(true);
  });

  it("returns false for normal users", () => {
    expect(isBot("goku")).toBe(false);
    expect(isBot("vegeta-prince")).toBe(false);
    expect(isBot("bulma42")).toBe(false);
  });
});

describe("extractOwnPRComments", () => {
  function makePR(overrides: Record<string, any> = {}) {
    return {
      state: "OPEN",
      number: 1,
      title: "Test PR",
      repository: { nameWithOwner: "capsulecorp/scouters" },
      comments: { nodes: [] },
      reviewThreads: { nodes: [] },
      ...overrides,
    };
  }

  it("extracts issue comments from open PRs", () => {
    const pr = makePR({
      comments: {
        nodes: [
          {
            databaseId: 1,
            url: "https://url",
            body: "nice",
            createdAt: "2026-01-05T10:00:00Z",
            updatedAt: "2026-01-05T10:00:00Z",
            author: { login: "goku", avatarUrl: "" },
          },
        ],
      },
    });
    const result = extractOwnPRComments([pr], "bulma");
    expect(result).toHaveLength(1);
    expect(result[0].user.login).toBe("goku");
  });

  it("excludes own comments", () => {
    const pr = makePR({
      comments: {
        nodes: [
          {
            databaseId: 1,
            url: "https://url",
            body: "my own comment",
            createdAt: "2026-01-05T10:00:00Z",
            updatedAt: "2026-01-05T10:00:00Z",
            author: { login: "bulma", avatarUrl: "" },
          },
        ],
      },
    });
    expect(extractOwnPRComments([pr], "bulma")).toHaveLength(0);
  });

  it("excludes bot comments", () => {
    const pr = makePR({
      comments: {
        nodes: [
          {
            databaseId: 1,
            url: "https://url",
            body: "auto review",
            createdAt: "2026-01-05T10:00:00Z",
            updatedAt: "2026-01-05T10:00:00Z",
            author: { login: "codecov[bot]", avatarUrl: "" },
          },
        ],
      },
    });
    expect(extractOwnPRComments([pr], "bulma")).toHaveLength(0);
  });

  it("skips closed/merged PRs", () => {
    const pr = makePR({
      state: "CLOSED",
      comments: {
        nodes: [
          {
            databaseId: 1,
            url: "https://url",
            body: "hi",
            createdAt: "2026-01-05T10:00:00Z",
            updatedAt: "2026-01-05T10:00:00Z",
            author: { login: "goku", avatarUrl: "" },
          },
        ],
      },
    });
    expect(extractOwnPRComments([pr], "bulma")).toHaveLength(0);
  });

  it("extracts review thread comments", () => {
    const pr = makePR({
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  databaseId: 2,
                  url: "https://url2",
                  body: "thread comment",
                  createdAt: "2026-01-05T10:00:00Z",
                  updatedAt: "2026-01-05T10:00:00Z",
                  author: { login: "vegeta", avatarUrl: "" },
                },
              ],
            },
          },
        ],
      },
    });
    const result = extractOwnPRComments([pr], "bulma");
    expect(result).toHaveLength(1);
    expect(result[0].user.login).toBe("vegeta");
  });

  it("returns empty for empty input", () => {
    expect(extractOwnPRComments([], "bulma")).toHaveLength(0);
  });
});

describe("buildYearRanges", () => {
  it("returns single range for same-year dates", () => {
    const ranges = buildYearRanges("2026-01-05", "2026-07-12");
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: "2026-01-05", end: "2026-07-12" });
  });

  it("splits across year boundary", () => {
    const ranges = buildYearRanges("2025-06-01", "2026-08-20");
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBe("2025-06-01");
    expect(ranges[0].end).toBe("2026-05-31");
    expect(ranges[1].start).toBe("2026-06-01");
    expect(ranges[1].end).toBe("2026-08-20");
  });

  it("splits multi-year range into yearly chunks", () => {
    const ranges = buildYearRanges("2024-01-01", "2026-12-31");
    expect(ranges.length).toBeGreaterThanOrEqual(3);
    expect(ranges[0].start).toBe("2024-01-01");
    expect(ranges[ranges.length - 1].end).toBe("2026-12-31");
  });

  it("handles single-day range", () => {
    const ranges = buildYearRanges("2026-05-23", "2026-05-23");
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: "2026-05-23", end: "2026-05-23" });
  });

  it("ranges are contiguous (no gaps or overlaps)", () => {
    const ranges = buildYearRanges("2023-03-15", "2026-08-20");
    for (let i = 1; i < ranges.length; i++) {
      const prevEnd = new Date(ranges[i - 1].end);
      const curStart = new Date(ranges[i].start);
      const diffMs = curStart.getTime() - prevEnd.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(1);
    }
  });
});
