import React, { useMemo } from "react";
import { GitHubPR } from "../types";

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 4) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

interface RepoBreakdownProps {
  prs: GitHubPR[];
  selectedRepos?: Set<string>;
  onToggleRepo?: (repo: string) => void;
}

export function RepoBreakdown({ prs, selectedRepos, onToggleRepo }: RepoBreakdownProps) {
  const repos = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pr of prs) {
      counts.set(pr.repo_full_name, (counts.get(pr.repo_full_name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        color: hashColor(name),
        pct: (count / prs.length) * 100,
      }));
  }, [prs]);

  if (repos.length === 0) return null;

  const hasSelection = selectedRepos && selectedRepos.size > 0;

  return (
    <div className="repo-bar-container">
      <div className="repo-bar">
        {repos.map((r) => (
          <div
            key={r.name}
            className="repo-bar-segment"
            style={{
              width: `${r.pct}%`,
              backgroundColor: r.color,
              opacity: hasSelection && !selectedRepos.has(r.name) ? 0.2 : 1,
              cursor: onToggleRepo ? "pointer" : "default",
            }}
            title={`${r.name}: ${r.count} PR${r.count !== 1 ? "s" : ""}`}
            onClick={() => onToggleRepo?.(r.name)}
          />
        ))}
      </div>
      <div className="repo-bar-legend">
        {repos.map((r) => {
          const isSelected = hasSelection && selectedRepos?.has(r.name);
          return (
            <span
              key={r.name}
              className={`repo-bar-legend-pill${isSelected ? " active" : ""}`}
              style={{
                borderColor: r.color,
                backgroundColor: isSelected ? r.color : "transparent",
                color: isSelected ? "white" : r.color,
                cursor: onToggleRepo ? "pointer" : "default",
              }}
              onClick={() => onToggleRepo?.(r.name)}
            >
              {r.name.split("/").pop()} ({r.count})
            </span>
          );
        })}
      </div>
    </div>
  );
}
