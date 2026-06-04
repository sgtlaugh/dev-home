import React, { useState, useEffect, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import {
  IconGitPullRequest,
  IconGitMerge,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { fetchPRsByDateRange, fetchCommitCount } from "../services/github";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { Timestamp } from "./Timestamp";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";

type DateMode = "month" | "year" | "custom";
type StateFilter = "all" | "open" | "merged" | "closed";

const MIN_YEAR = 2000;

const REPO_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#bc8ef9",
  "#f0883e",
  "#f85149",
  "#d29922",
  "#79c0ff",
  "#56d364",
];

interface PRHistoryProps {
  onCountChange?: (count: number) => void;
}

function getDateKey(timestamp: string): string {
  const hoursAgo = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 24) return "Today";
  if (hoursAgo < 48) return "Yesterday";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function RepoBreakdown({ prs }: { prs: GitHubPR[] }) {
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

function ContributionHeatmap({
  prs,
  mode,
  year,
  month,
}: {
  prs: GitHubPR[];
  mode: DateMode;
  year: number;
  month: number;
}) {
  const { cells, monthLabels } = useMemo(() => {
    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const countByDate = new Map<string, number>();
    for (const pr of prs) {
      const d = toLocalDateStr(new Date(pr.created_at));
      countByDate.set(d, (countByDate.get(d) || 0) + 1);
    }

    let startDate: Date;
    let endDate: Date;

    if (mode === "year") {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31);
    } else if (mode === "month") {
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0);
    } else {
      if (prs.length === 0) return { cells: [], monthLabels: [] };
      const dates = prs.map((p) => new Date(p.created_at).getTime());
      startDate = new Date(Math.min(...dates));
      endDate = new Date(Math.max(...dates));
    }

    // Align to start of week (Sunday)
    const aligned = new Date(startDate);
    aligned.setDate(aligned.getDate() - aligned.getDay());

    const gridCells: { date: string; count: number; dayOfWeek: number }[] = [];
    const d = new Date(aligned);
    while (d <= endDate || d.getDay() !== 0) {
      const key = toLocalDateStr(d);
      const inRange = d >= startDate && d <= endDate;
      gridCells.push({
        date: key,
        count: inRange ? countByDate.get(key) || 0 : -1,
        dayOfWeek: d.getDay(),
      });
      d.setDate(d.getDate() + 1);
      if (gridCells.length > 600) break;
    }

    // Month labels for year and custom views (skip for single-month)
    const labels: { label: string; col: number }[] = [];
    if (mode !== "month") {
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      let lastMonth = -1;
      for (let i = 0; i < gridCells.length; i++) {
        if (gridCells[i].dayOfWeek !== 0) continue;
        const [, m] = gridCells[i].date.split("-").map(Number);
        if (m !== lastMonth) {
          labels.push({ label: monthNames[m - 1], col: Math.floor(i / 7) });
          lastMonth = m;
        }
      }
    }

    return { cells: gridCells, monthLabels: labels };
  }, [prs, mode, year, month]);

  if (cells.length === 0) return null;

  const totalWeeks = Math.ceil(cells.length / 7);
  const dayLabels = ["Sun", "", "Tue", "", "Thu", "", "Sat"];

  return (
    <div className="heatmap-container">
      {monthLabels.length > 0 && (
        <div
          className="heatmap-month-labels"
          style={{ position: "relative", height: "16px", marginLeft: "24px" }}
        >
          {monthLabels.map((ml, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: ml.col * 16,
              }}
            >
              {ml.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex" }}>
        <div className="heatmap-day-labels">
          {dayLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div className="heatmap-grid">
          {cells.map((cell, i) => {
            const level =
              cell.count < 0
                ? -1
                : cell.count === 0
                  ? 0
                  : cell.count <= 1
                    ? 1
                    : cell.count <= 2
                      ? 2
                      : cell.count <= 4
                        ? 3
                        : 4;
            return (
              <div
                key={i}
                className={`heatmap-cell ${level < 0 ? "" : `heatmap-cell-${level}`}`}
                style={level < 0 ? { background: "transparent" } : undefined}
                title={
                  level >= 0
                    ? `${cell.date}: ${cell.count} PR${cell.count !== 1 ? "s" : ""}`
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <div key={l} className={`heatmap-legend-cell heatmap-cell-${l}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function PRCard({ pr, onClick }: { pr: GitHubPR; onClick: () => void }) {
  const accentColor = pr.merged ? "#bc8ef9" : pr.state === "open" ? "#3fb950" : "#f85149";

  return (
    <div
      className="activity-item"
      style={{ borderLeftColor: accentColor, cursor: "pointer" }}
      onClick={onClick}
    >
      <div className="activity-icon" style={{ color: accentColor }}>
        {pr.merged ? <IconGitMerge size={16} /> : <IconGitPullRequest size={16} />}
      </div>
      <div className="activity-content" style={{ minWidth: 0 }}>
        <div className="activity-header">
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            {pr.draft && (
              <Badge bg="" className="badge-status-neutral" style={{ fontSize: "0.65rem" }}>
                Draft
              </Badge>
            )}
            {pr.merged ? (
              <Badge bg="" className="badge-status-purple" style={{ fontSize: "0.65rem" }}>
                Merged
              </Badge>
            ) : pr.state === "open" ? (
              <Badge bg="" className="badge-status-green" style={{ fontSize: "0.65rem" }}>
                Open
              </Badge>
            ) : (
              <Badge bg="" className="badge-status-red" style={{ fontSize: "0.65rem" }}>
                Closed
              </Badge>
            )}
            <ChecksStatusIcon status={pr.checks_status} />
          </div>
          <Timestamp timestamp={pr.created_at} />
        </div>
        <a
          href={pr.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="activity-title"
          onClick={(e) => e.stopPropagation()}
        >
          #{pr.number} {pr.title}
        </a>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
          <Badge
            bg=""
            className="badge-status-neutral"
            style={{ fontSize: "0.6rem", fontWeight: 500 }}
          >
            {pr.repo_full_name}
          </Badge>
          <span className="branch-tag" style={{ fontSize: "0.65rem" }}>
            {pr.head.ref}
          </span>
          <span style={{ fontSize: "0.65rem", color: "#8b949e" }}>→</span>
          <span className="branch-tag" style={{ fontSize: "0.65rem" }}>
            {pr.base.ref}
          </span>
        </div>
      </div>
    </div>
  );
}

const STAT_DEFS: { key: StateFilter; label: string; color: string }[] = [
  { key: "all", label: "Total", color: "#3fb950" },
  { key: "merged", label: "Merged", color: "#a371f7" },
  { key: "open", label: "Open", color: "#58a6ff" },
  { key: "closed", label: "Closed", color: "#f85149" },
];

export const PRHistory: React.FC<PRHistoryProps> = ({ onCountChange }) => {
  const now = new Date();
  const [mode, setMode] = useState<DateMode>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [commitCount, setCommitCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const getDateRange = (): { start: string; end: string } => {
    if (mode === "month") {
      const monthStr = month.toString().padStart(2, "0");
      const start = `${year}-${monthStr}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${year}-${monthStr}-${lastDay.toString().padStart(2, "0")}`;
      return { start, end };
    } else if (mode === "year") {
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }
    return { start: startDate, end: endDate };
  };

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const loadPRs = async () => {
      const range = getDateRange();
      if (!range.start || !range.end) {
        if (!signal.aborted) {
          setPrs([]);
          setCommitCount(0);
          setLoading(false);
        }
        return;
      }

      setPrs([]);
      setCommitCount(0);
      setLoading(true);
      setError(null);
      try {
        const [prsResult, commits] = await Promise.all([
          fetchPRsByDateRange(range.start, range.end, signal),
          fetchCommitCount(range.start, range.end, signal),
        ]);
        if (signal.aborted) return;
        setPrs(prsResult);
        setCommitCount(commits);
        onCountChange?.(prsResult.length);
      } catch (err) {
        if (signal.aborted) return;
        setError(`Failed to load PRs: ${err instanceof Error ? err.message : "Unknown error"}`);
        onCountChange?.(0);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    loadPRs();
    return () => abortRef.current?.abort();
  }, [mode, year, month, startDate, endDate, onCountChange]);

  const mergedCount = prs.filter((pr) => pr.merged).length;
  const closedCount = prs.filter((pr) => pr.state === "closed" && !pr.merged).length;
  const openCount = prs.filter((pr) => pr.state === "open" && !pr.merged).length;

  const statCounts: Record<StateFilter, number> = {
    all: prs.length,
    merged: mergedCount,
    open: openCount,
    closed: closedCount,
  };

  const avgMergeTime = useMemo(() => {
    const merged = prs.filter((pr) => pr.merged && pr.merged_at);
    if (merged.length === 0) return null;
    const totalDays = merged.reduce((sum, pr) => {
      const created = new Date(pr.created_at).getTime();
      const mergedAt = new Date(pr.merged_at!).getTime();
      return sum + (mergedAt - created) / (1000 * 60 * 60 * 24);
    }, 0);
    return totalDays / merged.length;
  }, [prs]);

  const filteredPrs = useMemo(() => {
    return prs.filter((pr) => {
      if (stateFilter === "all") return true;
      if (stateFilter === "merged") return pr.merged;
      if (stateFilter === "open") return pr.state === "open" && !pr.merged;
      if (stateFilter === "closed") return pr.state === "closed" && !pr.merged;
      return true;
    });
  }, [prs, stateFilter]);

  const groupedPrs = useMemo(() => {
    const sorted = [...filteredPrs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const groups = new Map<string, GitHubPR[]>();
    for (const pr of sorted) {
      const key = getDateKey(pr.created_at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pr);
    }
    return groups;
  }, [filteredPrs]);

  const toggleFilter = (key: StateFilter) => {
    setStateFilter(stateFilter === key ? "all" : key);
  };

  const stepMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    if (newYear >= MIN_YEAR && newYear <= now.getFullYear() + 1) {
      setMonth(newMonth);
      setYear(newYear);
    }
  };

  const stepYear = (delta: number) => {
    const newYear = year + delta;
    if (newYear >= MIN_YEAR && newYear <= now.getFullYear() + 1) {
      setYear(newYear);
    }
  };

  const applyPreset = (preset: string) => {
    const today = new Date();
    const toStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const end = toStr(today);
    let start: string;
    if (preset === "30d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      start = toStr(d);
    } else if (preset === "90d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      start = toStr(d);
    } else if (preset === "6mo") {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      start = toStr(d);
    } else if (preset === "1y") {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      start = toStr(d);
    } else {
      start = `${MIN_YEAR}-01-01`;
    }
    setStartDate(start);
    setEndDate(end);
  };

  const monthLabel = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const getLabel = () => {
    if (mode === "month") return monthLabel;
    if (mode === "year") return year.toString();
    return startDate && endDate ? `${startDate} to ${endDate}` : "Custom Range";
  };

  return (
    <div style={{ padding: "1rem" }}>
      {/* Stat Cards */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {STAT_DEFS.map((s) => (
          <div
            key={s.key}
            className={`stat-card clickable${stateFilter === s.key || (s.key === "all" && stateFilter === "all") ? "" : ""}${stateFilter === s.key && s.key !== "all" ? " active" : ""}`}
            style={
              stateFilter === s.key && s.key !== "all"
                ? { borderColor: s.color, boxShadow: `0 0 12px ${s.color}33` }
                : undefined
            }
            onClick={() => toggleFilter(s.key)}
          >
            <div className="stat-value" style={{ color: s.color }}>
              {statCounts[s.key]}
            </div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#58a6ff" }}>
            {commitCount}
          </div>
          <div className="stat-label">Commits</div>
        </div>
        {avgMergeTime !== null && (
          <div className="stat-card">
            <div className="stat-value" style={{ color: "#d2a8ff" }}>
              {avgMergeTime < 1
                ? `${Math.round(avgMergeTime * 24)}h`
                : `${avgMergeTime.toFixed(1)}d`}
            </div>
            <div className="stat-label">Avg Merge</div>
          </div>
        )}
      </div>

      {/* Repo Breakdown */}
      {prs.length > 0 && <RepoBreakdown prs={filteredPrs.length > 0 ? filteredPrs : prs} />}

      {/* Heatmap */}
      {prs.length > 0 && <ContributionHeatmap prs={prs} mode={mode} year={year} month={month} />}

      {/* Controls */}
      <Card className="controls-card mb-4">
        <Card.Body>
          <div className="d-flex gap-3 align-items-center flex-wrap">
            <div className="segmented-control">
              {(["month", "year", "custom"] as DateMode[]).map((m) => (
                <button
                  key={m}
                  className={`segmented-btn ${mode === m ? "active" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {mode === "month" && (
              <div className="month-nav">
                <button className="month-nav-arrow" onClick={() => stepMonth(-1)}>
                  <IconChevronLeft size={14} />
                </button>
                <span className="month-nav-label">{monthLabel}</span>
                <button className="month-nav-arrow" onClick={() => stepMonth(1)}>
                  <IconChevronRight size={14} />
                </button>
              </div>
            )}

            {mode === "year" && (
              <div className="month-nav">
                <button className="month-nav-arrow" onClick={() => stepYear(-1)}>
                  <IconChevronLeft size={14} />
                </button>
                <span className="month-nav-label" style={{ minWidth: "60px" }}>
                  {year}
                </span>
                <button className="month-nav-arrow" onClick={() => stepYear(1)}>
                  <IconChevronRight size={14} />
                </button>
              </div>
            )}

            {mode === "custom" && (
              <div className="d-flex gap-2 align-items-center flex-wrap">
                {[
                  { key: "30d", label: "30 days" },
                  { key: "90d", label: "90 days" },
                  { key: "6mo", label: "6 months" },
                  { key: "1y", label: "1 year" },
                  { key: "bigbang", label: "Big Bang 💥" },
                ].map((p) => (
                  <button
                    key={p.key}
                    className="activity-filter-chip"
                    onClick={() => applyPreset(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
                <span style={{ color: "#30363d", fontSize: "0.75rem" }}>|</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="filter-input"
                  style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                />
                <span style={{ color: "#8b949e", fontSize: "0.75rem" }}>→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="filter-input"
                  style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                />
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      {error && (
        <div className="alert alert-danger small" role="alert">
          {error}
        </div>
      )}

      {loading && prs.length === 0 && (
        <div className="d-flex justify-content-center align-items-center py-5">
          <Spinner animation="border" variant="secondary" />
        </div>
      )}

      {!loading && filteredPrs.length === 0 ? (
        <EmptyState
          icon={<IconGitPullRequest size={40} stroke={1.5} />}
          title={
            prs.length === 0
              ? `No pull requests in ${getLabel()}`
              : `No ${stateFilter} pull requests in ${getLabel()}`
          }
          description={
            prs.length === 0
              ? "No pull requests were opened in this period."
              : `No ${stateFilter} pull requests found. Click the stat card again to clear the filter.`
          }
        />
      ) : (
        <div className="activity-timeline">
          {Array.from(groupedPrs.entries()).map(([dateLabel, datePRs]) => (
            <div key={dateLabel} className="activity-section">
              <div className="activity-date-label">
                {dateLabel}
                <Badge
                  bg="secondary"
                  pill
                  style={{ fontSize: "0.7rem", marginLeft: "8px", verticalAlign: "middle" }}
                >
                  {datePRs.length}
                </Badge>
              </div>
              <div className="activity-list">
                {datePRs.map((pr) => (
                  <PRCard key={pr.id} pr={pr} onClick={() => setSelectedPR(pr)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <DescriptionModal
        show={!!selectedPR}
        onHide={() => setSelectedPR(null)}
        title={selectedPR ? `#${selectedPR.number} ${selectedPR.title}` : ""}
        subtitle={selectedPR?.repo_full_name}
        description={selectedPR?.body || ""}
        url={selectedPR?.html_url}
        checks={selectedPR?.checks}
      />
    </div>
  );
};
