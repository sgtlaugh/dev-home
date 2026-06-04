import React, { useMemo } from "react";
import { GitHubPR } from "../types";

const REPO_COLORS = [
  "#0969da",
  "#1a7f37",
  "#8250df",
  "#bc4c00",
  "#cf222e",
  "#9a6700",
  "#0550ae",
  "#116329",
];

export function RepoBreakdown({ prs }: { prs: GitHubPR[] }) {
  const repos = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pr of prs) {
      counts.set(pr.repo_full_name, (counts.get(pr.repo_full_name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({
        name,
        count,
        color: REPO_COLORS[i % REPO_COLORS.length],
        pct: (count / prs.length) * 100,
      }));
  }, [prs]);

  if (repos.length === 0) return null;

  return (
    <div className="repo-bar-container">
      <div className="repo-bar">
        {repos.map((r) => (
          <div
            key={r.name}
            className="repo-bar-segment"
            style={{ width: `${r.pct}%`, backgroundColor: r.color }}
            title={`${r.name}: ${r.count} PR${r.count !== 1 ? "s" : ""}`}
          />
        ))}
      </div>
      <div className="repo-bar-legend">
        {repos.map((r) => (
          <span key={r.name} className="repo-bar-legend-item">
            <span className="repo-bar-legend-dot" style={{ backgroundColor: r.color }} />
            {r.name.split("/").pop()} ({r.count})
          </span>
        ))}
      </div>
    </div>
  );
}
