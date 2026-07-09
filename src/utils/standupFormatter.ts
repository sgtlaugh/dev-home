import { ActivityItem } from "../services/activity";

const TERMINAL_STATUSES = new Set([
  "done",
  "closed",
  "resolved",
  "complete",
  "released",
  "cancelled",
]);

const PR_ACTIONS = [
  "Created PR",
  "Merged PR",
  "Approved PR",
  "Changes Requested",
  "Commented on PR",
];

const TICKET_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

type Category = "Created" | "Merged" | "Reviewed";

interface PRRef {
  shortName: string;
  url: string;
}

interface TicketGroup {
  category: Category;
  ticketId: string;
  prs: PRRef[];
}

export function formatStandupNotes(activities: ActivityItem[], jiraBaseUrl?: string): string {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = activities.filter((a) => a.timestamp >= cutoff);

  const ownPRs = new Set<string>();
  for (const a of activities) {
    if (a.action === "Created PR") ownPRs.add(a.entityKey);
  }

  const prActions = new Map<string, Set<string>>();
  const prMeta = new Map<string, { title: string; url: string }>();
  for (const a of recent) {
    if (PR_ACTIONS.includes(a.action)) {
      if (!prActions.has(a.entityKey)) prActions.set(a.entityKey, new Set());
      prActions.get(a.entityKey)!.add(a.action);
      prMeta.set(a.entityKey, { title: a.title, url: a.url });
    }
  }

  const terminalLines: string[] = [];
  for (const a of recent) {
    if (a.action === "Changed status") {
      const toStatus = a.metadata?.toStatus || "";
      if (TERMINAL_STATUSES.has(toStatus.toLowerCase())) {
        terminalLines.push(`- ${a.title} → ${toStatus}`);
      }
    }
  }

  const groups = new Map<string, TicketGroup>();

  for (const [key, actions] of prActions) {
    const meta = prMeta.get(key)!;
    const isOwn = ownPRs.has(key);

    let category: Category | null = null;
    if (isOwn) {
      if (actions.has("Created PR")) category = "Created";
      else if (actions.has("Merged PR")) category = "Merged";
    } else {
      if (actions.has("Merged PR")) category = "Merged";
      else if (
        actions.has("Approved PR") ||
        actions.has("Changes Requested") ||
        actions.has("Commented on PR")
      )
        category = "Reviewed";
    }
    if (!category) continue;

    const ticketMatch = meta.title.match(TICKET_RE);
    const ticketId = ticketMatch ? ticketMatch[1] : "";
    const shortName = key.replace(/^[^/]+\//, "");

    const groupKey = `${category}:${ticketId}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { category, ticketId, prs: [] });
    groups.get(groupKey)!.prs.push({ shortName, url: meta.url });
  }

  const categoryOrder: Record<Category, number> = { Created: 0, Merged: 1, Reviewed: 2 };
  const sorted = [...groups.values()].sort((a, b) => {
    const d = categoryOrder[a.category] - categoryOrder[b.category];
    return d !== 0 ? d : a.ticketId.localeCompare(b.ticketId);
  });

  const prLines: string[] = [];
  for (const g of sorted) {
    const n = g.prs.length;
    const prWord = n === 1 ? "PR" : "PRs";
    const prLinks = g.prs.map((p) => `[${p.shortName}](${p.url})`).join(", ");
    const ticketLabel =
      g.ticketId && jiraBaseUrl
        ? `[${g.ticketId}](${jiraBaseUrl}/browse/${g.ticketId})`
        : g.ticketId || null;

    if (ticketLabel) {
      prLines.push(`- ${g.category} ${n} ${prWord} for ${ticketLabel}: ${prLinks}`);
    } else {
      prLines.push(`- ${g.category} ${n} ${prWord}: ${prLinks}`);
    }
  }

  return [...terminalLines, ...prLines].join("\n");
}

export function getStandupTitle(): string {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Standup - ${formatted}`;
}
