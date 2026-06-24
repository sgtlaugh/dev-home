import { describe, it, expect } from "vitest";
import { truncateText, formatGitHubTitle, getReferenceUrl, getNoteDisplayTitle } from "../text";
import { Note } from "../../types";

function makeNote(overrides: Partial<Note>): Note {
  return {
    id: 1,
    type: "free_text",
    title: "",
    content: "some content",
    reference_id: null,
    resolved: 0,
    created_at: "2026-01-05T10:00:00Z",
    updated_at: "2026-01-05T10:00:00Z",
    ...overrides,
  };
}

describe("truncateText", () => {
  it("returns empty string for falsy input", () => {
    expect(truncateText("", 10)).toBe("");
  });

  it("returns full text when shorter than max", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("truncates and adds ellipsis", () => {
    expect(truncateText("hello world", 5)).toBe("hello...");
  });

  it("trims trailing whitespace before ellipsis", () => {
    expect(truncateText("hello world", 6)).toBe("hello...");
  });

  it("returns exact length text unchanged", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });
});

describe("formatGitHubTitle", () => {
  it("formats PR URL as repo#number", () => {
    expect(formatGitHubTitle("https://github.com/capsulecorp/scouters/pull/42")).toBe(
      "scouters#42",
    );
  });

  it("extracts repo name from non-PR URL", () => {
    expect(formatGitHubTitle("https://github.com/capsulecorp/scouters")).toBe("scouters");
  });

  it("returns original URL if no match", () => {
    expect(formatGitHubTitle("https://gitlab.com/org/repo")).toBe("https://gitlab.com/org/repo");
  });

  it("handles URL with trailing path after PR number", () => {
    expect(formatGitHubTitle("https://github.com/org/repo/pull/7")).toBe("repo#7");
  });
});

describe("getReferenceUrl", () => {
  it("returns null when no reference_id", () => {
    expect(
      getReferenceUrl(
        makeNote({ type: "jira_ticket", reference_id: null }),
        "https://jira.example.com",
      ),
    ).toBeNull();
  });

  it("builds JIRA URL from bare key", () => {
    expect(
      getReferenceUrl(
        makeNote({ type: "jira_ticket", reference_id: "PROJ-123" }),
        "https://jira.example.com",
      ),
    ).toBe("https://jira.example.com/browse/PROJ-123");
  });

  it("returns full JIRA URL as-is", () => {
    const url = "https://myorg.atlassian.net/browse/PROJ-456";
    expect(
      getReferenceUrl(
        makeNote({ type: "jira_ticket", reference_id: url }),
        "https://jira.example.com",
      ),
    ).toBe(url);
  });

  it("strips trailing slashes from base URL", () => {
    expect(
      getReferenceUrl(
        makeNote({ type: "jira_ticket", reference_id: "PROJ-1" }),
        "https://jira.example.com///",
      ),
    ).toBe("https://jira.example.com/browse/PROJ-1");
  });

  it("returns null for JIRA with empty base URL", () => {
    expect(
      getReferenceUrl(makeNote({ type: "jira_ticket", reference_id: "PROJ-1" }), ""),
    ).toBeNull();
  });

  it("returns reference_id for github_pr type", () => {
    expect(
      getReferenceUrl(
        makeNote({ type: "github_pr", reference_id: "https://github.com/org/repo/pull/1" }),
        "",
      ),
    ).toBe("https://github.com/org/repo/pull/1");
  });

  it("returns reference_id for link type", () => {
    expect(
      getReferenceUrl(makeNote({ type: "link", reference_id: "https://example.com" }), ""),
    ).toBe("https://example.com");
  });

  it("returns null for free_text type", () => {
    expect(
      getReferenceUrl(makeNote({ type: "free_text", reference_id: "something" }), ""),
    ).toBeNull();
  });
});

describe("getNoteDisplayTitle", () => {
  it("returns title when present", () => {
    expect(getNoteDisplayTitle(makeNote({ title: "My Title" }))).toBe("My Title");
  });

  it("formats github_pr as repo#number", () => {
    expect(
      getNoteDisplayTitle(
        makeNote({
          type: "github_pr",
          reference_id: "https://github.com/capsulecorp/scouters/pull/7",
        }),
      ),
    ).toBe("scouters#7");
  });

  it("extracts JIRA key from URL", () => {
    expect(
      getNoteDisplayTitle(
        makeNote({ type: "jira_ticket", reference_id: "https://org.atlassian.net/browse/PROJ-42" }),
      ),
    ).toBe("PROJ-42");
  });

  it("extracts bare JIRA key", () => {
    expect(getNoteDisplayTitle(makeNote({ type: "jira_ticket", reference_id: "PROJ-42" }))).toBe(
      "PROJ-42",
    );
  });

  it("returns reference_id for link type", () => {
    expect(
      getNoteDisplayTitle(makeNote({ type: "link", reference_id: "https://example.com" })),
    ).toBe("https://example.com");
  });

  it("returns 'Untitled note' when nothing matches", () => {
    expect(getNoteDisplayTitle(makeNote({ type: "free_text", reference_id: null }))).toBe(
      "Untitled note",
    );
  });

  it("returns 'Untitled note' for github_pr with no reference", () => {
    expect(getNoteDisplayTitle(makeNote({ type: "github_pr", reference_id: "" }))).toBe(
      "Untitled note",
    );
  });
});
