export interface ActionConfig {
  action: string;
  badgeClass: string;
  priority: number;
  match: (action: string) => boolean;
  filterLabel?: string;
  filterColor?: string;
  filterDarkColor?: string;
}

const ACTIONS: ActionConfig[] = [
  {
    action: "Created PR",
    badgeClass: "badge-status-green-dark",
    priority: 0,
    match: (a) => a === "Created PR",
    filterLabel: "Created",
    filterColor: "#1a7f37",
    filterDarkColor: "#116329",
  },
  {
    action: "Created",
    badgeClass: "badge-status-green-dark",
    priority: 1,
    match: (a) => a.includes("Created ticket"),
    filterLabel: "Created ticket",
    filterColor: "#1a7f37",
    filterDarkColor: "#116329",
  },
  {
    action: "Merged PR",
    badgeClass: "badge-status-purple-dark",
    priority: 2,
    match: (a) => a === "Merged PR",
    filterLabel: "Merged",
    filterColor: "#8250df",
    filterDarkColor: "#6639ba",
  },
  {
    action: "Approved PR",
    badgeClass: "badge-status-purple-light",
    priority: 3,
    match: (a) => a.includes("Approved"),
    filterLabel: "Approved",
    filterColor: "#8250df",
    filterDarkColor: "#6639ba",
  },
  {
    action: "Changes Requested",
    badgeClass: "badge-status-coral",
    priority: 4,
    match: (a) => a.includes("Changes Requested"),
    filterLabel: "Changes Requested",
    filterColor: "#e8684a",
    filterDarkColor: "#c4553b",
  },
  {
    action: "Changed status",
    badgeClass: "badge-status-purple",
    priority: 5,
    match: (a) => a.includes("Changed status") || a.includes("status"),
    filterLabel: "Changed status",
    filterColor: "#8250df",
    filterDarkColor: "#6639ba",
  },
  {
    action: "Commented",
    badgeClass: "badge-status-blue",
    priority: 6,
    match: (a) => a.includes("Comment"),
    filterLabel: "Comments",
    filterColor: "#0969da",
    filterDarkColor: "#0550ae",
  },
  {
    action: "Committed",
    badgeClass: "badge-status-green-light",
    priority: 7,
    match: (a) => a.includes("Committed"),
    filterLabel: "Commits",
    filterColor: "#1a7f37",
    filterDarkColor: "#116329",
  },
];

const DEFAULT_CONFIG: ActionConfig = {
  action: "Other",
  badgeClass: "badge-status-neutral",
  priority: 99,
  match: () => true,
};

export function getActionConfig(action: string): ActionConfig {
  return ACTIONS.find((c) => c.match(action)) || DEFAULT_CONFIG;
}

export function getActionPriority(action: string): number {
  return getActionConfig(action).priority;
}

export function getActionBadgeClass(action: string): string {
  return getActionConfig(action).badgeClass;
}

export interface FilterCategory {
  label: string;
  color: string;
  darkColor: string;
}

export function getFilterCategories(): FilterCategory[] {
  return ACTIONS.filter((a) => a.filterLabel).map((a) => ({
    label: a.filterLabel!,
    color: a.filterColor!,
    darkColor: a.filterDarkColor!,
  }));
}

export function categorizeAction(action: string): string {
  const config = ACTIONS.find((c) => c.match(action));
  return config?.filterLabel || "Other";
}

const BADGE_COLORS: Record<string, string> = {
  "badge-status-green-light": "#1a7f37",
  "badge-status-green-dark": "#116329",
  "badge-status-blue": "#0969da",
  "badge-status-blue-dark": "#0550ae",
  "badge-status-purple-light": "#8250df",
  "badge-status-purple-dark": "#6639ba",
  "badge-status-purple": "#8250df",
  "badge-status-coral": "#e8684a",
  "badge-status-red": "#cf222e",
  "badge-status-red-dark": "#a40e26",
  "badge-status-neutral": "#656d76",
};

export function getBadgeColor(badgeClass: string): string {
  return BADGE_COLORS[badgeClass] || "#d1d9e0";
}
