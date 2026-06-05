import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from "react";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import { IconGitPullRequest, IconGitMerge } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { fetchPRsByDateRange, fetchCommitCount, fetchUserJoinDate } from "../services/github";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { Timestamp } from "./Timestamp";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";
import { RepoBreakdown } from "./RepoBreakdown";
import { ContributionHeatmap } from "./ContributionHeatmap";
import { DateRangePicker } from "./DateRangePicker";

export type DateMode = "month" | "year" | "custom";
type StateFilter = "all" | "open" | "merged" | "closed";

const MIN_YEAR = 2000;

interface PRHistoryProps {
  onCountChange?: (count: number) => void;
  active?: boolean;
}

function getDateKey(timestamp: string): string {
  const hoursAgo = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 24) return "Today";
  if (hoursAgo < 48) return "Yesterday";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PRCard({ pr, onClick }: { pr: GitHubPR; onClick: () => void }) {
  const accentColor = pr.merged ? "#8250df" : pr.state === "open" ? "#1a7f37" : "#cf222e";

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
          <span style={{ fontSize: "0.65rem", color: "#656d76" }}>→</span>
          <span className="branch-tag" style={{ fontSize: "0.65rem" }}>
            {pr.base.ref}
          </span>
        </div>
      </div>
    </div>
  );
}

const STAT_DEFS: { key: StateFilter; label: string; color: string }[] = [
  { key: "all", label: "Total", color: "#1a7f37" },
  { key: "merged", label: "Merged", color: "#8250df" },
  { key: "open", label: "Open", color: "#0969da" },
  { key: "closed", label: "Closed", color: "#cf222e" },
];

const STORAGE_KEY = "prhistory:state";

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveState(state: {
  mode: DateMode;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export const PRHistory: React.FC<PRHistoryProps> = ({ onCountChange, active = true }) => {
  const now = new Date();
  const stored = loadState();
  const [mode, setMode] = useState<DateMode>(stored?.mode ?? "month");
  const [year, setYear] = useState(stored?.year ?? now.getFullYear());
  const [month, setMonth] = useState(stored?.month ?? now.getMonth() + 1);
  const [startDate, setStartDate] = useState(stored?.startDate ?? "");
  const [endDate, setEndDate] = useState(stored?.endDate ?? "");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [commitCount, setCommitCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const [joinDate, setJoinDate] = useState<string | null>(null);

  const handleDateChange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setMode("custom");
  }, []);

  const abortRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    fetchUserJoinDate()
      .then(setJoinDate)
      .catch(() => setJoinDate(`${MIN_YEAR}-01-01`));
  }, []);

  useEffect(() => {
    saveState({ mode, year, month, startDate, endDate });
  }, [mode, year, month, startDate, endDate]);

  useEffect(() => {
    if (!active) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const loadPRs = async () => {
      let start: string, end: string;
      if (mode === "month") {
        const monthStr = month.toString().padStart(2, "0");
        start = `${year}-${monthStr}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        end = `${year}-${monthStr}-${lastDay.toString().padStart(2, "0")}`;
      } else if (mode === "year") {
        start = `${year}-01-01`;
        end = `${year}-12-31`;
      } else {
        start = startDate;
        end = endDate;
      }

      if (!start || !end) {
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
          fetchPRsByDateRange(start, end, signal),
          fetchCommitCount(start, end, signal),
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
  }, [mode, year, month, startDate, endDate, onCountChange, active]);

  const mergedCount = prs.filter((pr) => pr.merged).length;
  const closedCount = prs.filter((pr) => pr.state === "closed" && !pr.merged).length;
  const openCount = prs.filter((pr) => pr.state === "open" && !pr.merged).length;

  const statCounts: Record<StateFilter, number> = {
    all: prs.length,
    merged: mergedCount,
    open: openCount,
    closed: closedCount,
  };

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
        {STAT_DEFS.map((s) => {
          const bgColors: Record<StateFilter, string> = {
            all: "rgba(26, 127, 55, 0.05)",
            merged: "rgba(130, 80, 223, 0.05)",
            open: "rgba(9, 105, 218, 0.05)",
            closed: "rgba(207, 34, 46, 0.05)",
          };
          return (
            <div
              key={s.key}
              className={`stat-card clickable${stateFilter === s.key || (s.key === "all" && stateFilter === "all") ? "" : ""}${stateFilter === s.key && s.key !== "all" ? " active" : ""}`}
              style={{
                backgroundColor: bgColors[s.key],
                ...(stateFilter === s.key && s.key !== "all"
                  ? { borderColor: s.color, boxShadow: `0 0 12px ${s.color}33` }
                  : {}),
              }}
              onClick={() => toggleFilter(s.key)}
            >
              <div className="stat-value" style={{ color: s.color }}>
                {statCounts[s.key]}
              </div>
              <div className="stat-label">{s.label}</div>
            </div>
          );
        })}
        <div className="stat-card" style={{ backgroundColor: "rgba(26, 127, 55, 0.05)" }}>
          <div className="stat-value" style={{ color: "#3fb950" }}>
            {commitCount}
          </div>
          <div className="stat-label">Commits</div>
        </div>
      </div>

      {/* Repo Breakdown */}
      {prs.length > 0 && <RepoBreakdown prs={filteredPrs.length > 0 ? filteredPrs : prs} />}

      {/* Heatmap */}
      {prs.length > 0 && (
        <ContributionHeatmap
          prs={prs}
          mode={mode}
          year={year}
          month={month}
          selectedStart={
            mode === "month"
              ? `${year}-${String(month).padStart(2, "0")}-01`
              : mode === "year"
                ? `${year}-01-01`
                : startDate
          }
          selectedEnd={
            mode === "month"
              ? `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate().toString().padStart(2, "0")}`
              : mode === "year"
                ? `${year}-12-31`
                : endDate
          }
        />
      )}

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
              <div className="d-flex gap-2 align-items-center">
                <select
                  className="date-dropdown"
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(year, i).toLocaleString("default", { month: "long" })}
                    </option>
                  ))}
                </select>
                <select
                  className="date-dropdown"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            {mode === "year" && (
              <select
                className="date-dropdown"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => {
                  const y = new Date().getFullYear() - i;
                  return (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  );
                })}
              </select>
            )}
            {mode === "custom" && (
              <DateRangePicker
                joinDate={joinDate}
                onDateChange={handleDateChange}
                validationError={validationError}
                onValidationError={setValidationError}
                initialStart={startDate}
                initialEnd={endDate}
              />
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
