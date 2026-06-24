export function isAllowedAvatarDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host.endsWith(".atlassian.net") ||
      host.endsWith(".atlassian.com") ||
      host.endsWith(".gravatar.com") ||
      host.endsWith(".wp.com") ||
      host === "gravatar.com"
    );
  } catch {
    return false;
  }
}
