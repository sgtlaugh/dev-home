import { describe, it, expect } from "vitest";
import { isAllowedAvatarDomain } from "../avatarDomain";

describe("isAllowedAvatarDomain", () => {
  it("allows atlassian.net subdomains", () => {
    expect(isAllowedAvatarDomain("https://myorg.atlassian.net/avatar/user123")).toBe(true);
  });

  it("allows atlassian.com subdomains", () => {
    expect(isAllowedAvatarDomain("https://cdn.atlassian.com/img/avatar.png")).toBe(true);
  });

  it("allows atl-paas.net subdomains (JIRA Cloud avatar CDN)", () => {
    expect(
      isAllowedAvatarDomain(
        "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/abc123",
      ),
    ).toBe(true);
  });

  it("allows gravatar.com subdomains", () => {
    expect(isAllowedAvatarDomain("https://secure.gravatar.com/avatar/abc123")).toBe(true);
  });

  it("allows gravatar.com root", () => {
    expect(isAllowedAvatarDomain("https://gravatar.com/avatar/abc123")).toBe(true);
  });

  it("allows wp.com subdomains", () => {
    expect(isAllowedAvatarDomain("https://i0.wp.com/img.jpg")).toBe(true);
  });

  it("rejects arbitrary domains", () => {
    expect(isAllowedAvatarDomain("https://evil.com/avatar.png")).toBe(false);
    expect(isAllowedAvatarDomain("https://github.com/user.png")).toBe(false);
  });

  it("rejects domain spoofing via prefix", () => {
    expect(isAllowedAvatarDomain("https://not-atlassian.net/avatar")).toBe(false);
    expect(isAllowedAvatarDomain("https://evil-gravatar.com/avatar")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isAllowedAvatarDomain("not-a-url")).toBe(false);
    expect(isAllowedAvatarDomain("")).toBe(false);
  });
});
