import { describe, it, expect } from "vitest";
import { detectNote } from "../noteDetection";

describe("detectNote", () => {
  it("detects GitHub PR URL", () => {
    const result = detectNote("check https://github.com/capsulecorp/scouters/pull/42 please");
    expect(result.type).toBe("github_pr");
    expect(result.referenceId).toBe("https://github.com/capsulecorp/scouters/pull/42");
    expect(result.content).toContain("check");
  });

  it("detects GitHub repo URL (no PR number)", () => {
    const result = detectNote("see https://github.com/capsulecorp/scouters");
    expect(result.type).toBe("github_pr");
    expect(result.referenceId).toBe("https://github.com/capsulecorp/scouters");
  });

  it("detects full JIRA URL", () => {
    const result = detectNote("fix https://myorg.atlassian.net/browse/PROJ-123 asap");
    expect(result.type).toBe("jira_ticket");
    expect(result.referenceId).toBe("https://myorg.atlassian.net/browse/PROJ-123");
  });

  it("detects bare JIRA key", () => {
    const result = detectNote("working on PROJ-456");
    expect(result.type).toBe("jira_ticket");
    expect(result.referenceId).toBe("PROJ-456");
  });

  it("detects generic URL as link", () => {
    const result = detectNote("docs at https://docs.example.com/guide");
    expect(result.type).toBe("link");
    expect(result.referenceId).toBe("https://docs.example.com/guide");
  });

  it("returns free_text for plain text", () => {
    const result = detectNote("just a regular note");
    expect(result.type).toBe("free_text");
    expect(result.referenceId).toBe("");
    expect(result.content).toBe("just a regular note");
  });

  it("GitHub URL takes priority over JIRA key in same text", () => {
    const result = detectNote("PROJ-123 https://github.com/org/repo/pull/1");
    expect(result.type).toBe("github_pr");
  });

  it("JIRA URL takes priority over bare JIRA key", () => {
    const result = detectNote("PROJ-999 https://myorg.atlassian.net/browse/PROJ-123");
    expect(result.type).toBe("jira_ticket");
    expect(result.referenceId).toContain("atlassian.net");
  });

  it("JIRA URL takes priority over generic URL", () => {
    const result = detectNote(
      "https://myorg.atlassian.net/browse/PROJ-123 and https://example.com",
    );
    expect(result.type).toBe("jira_ticket");
  });

  it("handles JIRA key with numbers in project", () => {
    const result = detectNote("ABC2-42 is the ticket");
    expect(result.type).toBe("jira_ticket");
    expect(result.referenceId).toBe("ABC2-42");
  });

  it("does not match lowercase as JIRA key", () => {
    const result = detectNote("this is proj-123 lowercase");
    expect(result.type).toBe("free_text");
  });

  it("handles URL with query params and fragments", () => {
    const result = detectNote("see https://example.com/page?foo=bar#section");
    expect(result.type).toBe("link");
    expect(result.referenceId).toContain("?foo=bar#section");
  });
});
