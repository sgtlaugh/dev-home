export interface ActionCategory {
  label: string;
  color: string;
  darkColor: string;
  match: (action: string) => boolean;
}

export const ACTION_CATEGORIES: ActionCategory[] = [
  {
    label: "Commits",
    color: "#1a7f37",
    darkColor: "#116329",
    match: (a) => a.includes("Committed"),
  },
  { label: "Created", color: "#1a7f37", darkColor: "#116329", match: (a) => a === "Created PR" },
  { label: "Merged", color: "#8250df", darkColor: "#6639ba", match: (a) => a === "Merged PR" },
  {
    label: "Approved",
    color: "#8250df",
    darkColor: "#6639ba",
    match: (a) => a.includes("Approved"),
  },
  {
    label: "Changes Requested",
    color: "#9a6700",
    darkColor: "#7d5200",
    match: (a) => a.includes("Changes Requested"),
  },
  {
    label: "Created ticket",
    color: "#1a7f37",
    darkColor: "#116329",
    match: (a) => a.includes("Created ticket"),
  },
  {
    label: "Changed status",
    color: "#8250df",
    darkColor: "#6639ba",
    match: (a) => a.includes("Changed status"),
  },
  {
    label: "Comments",
    color: "#0969da",
    darkColor: "#0550ae",
    match: (a) => a.includes("Comment"),
  },
];

export function categorizeAction(action: string): string {
  for (const cat of ACTION_CATEGORIES) {
    if (cat.match(action)) return cat.label;
  }
  return "Other";
}
