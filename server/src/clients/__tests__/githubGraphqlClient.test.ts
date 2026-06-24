import { describe, it, expect } from "vitest";
import { injectRateLimit } from "../githubGraphqlClient";

describe("injectRateLimit", () => {
  it("injects rateLimit field after query opening brace", () => {
    const query = `query($org: String!) { organization(login: $org) { id } }`;
    const result = injectRateLimit(query);
    expect(result).toContain("rateLimit { limit remaining resetAt }");
    expect(result).toContain("organization(login: $org)");
  });

  it("does not double-inject if rateLimit already present", () => {
    const query = `query { rateLimit { remaining } user { login } }`;
    expect(injectRateLimit(query)).toBe(query);
  });

  it("handles query with variables", () => {
    const query = `query($l0: String!, $from: DateTime!) { u0: user(login: $l0) { login } }`;
    const result = injectRateLimit(query);
    expect(result).toContain("rateLimit");
    expect(result).toContain("u0: user");
  });

  it("handles named queries", () => {
    const query = `query FetchUser($id: ID!) { user(id: $id) { name } }`;
    const result = injectRateLimit(query);
    expect(result).toContain("rateLimit");
  });

  it("returns unchanged if no query keyword found", () => {
    const mutation = `mutation { deleteUser(id: "1") { success } }`;
    const result = injectRateLimit(mutation);
    expect(result).toBe(mutation);
  });
});
