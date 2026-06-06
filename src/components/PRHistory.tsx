import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  const date = new Date(timestamp);
  const today = new Date();
  const isCurrentYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(isCurrentYear ? {} : { year: "numeric" }),
  });
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

export const PRHistory: React.FC<PRHistoryProps> = ({ onCountChange, active = true }) => {
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

  const totalAdditions = prs.reduce((s, pr) => s + (pr.additions || 0), 0);
  const totalDeletions = prs.reduce((s, pr) => s + (pr.deletions || 0), 0);

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

  const totalLines = totalAdditions + totalDeletions;
  const addRatio = totalLines > 0 ? (totalAdditions / totalLines) * 100 : 0;

  return (
    <div style={{ padding: "1rem" }}>
      {/* Hero Stat Card */}
      <div
        className="stat-card clickable"
        style={{
          background: "linear-gradient(135deg, #0969da 0%, #033a99 100%)",
          color: "white",
          padding: "2rem",
          borderRadius: "12px",
          marginBottom: "1.5rem",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(9, 105, 218, 0.2)",
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
        }}
        onClick={() => toggleFilter("all")}
      >
        <div>
          <div style={{ fontSize: "2.5rem", fontWeight: 700 }}>{statCounts.all}</div>
          <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>Pull Requests</div>
        </div>
        <div style={{ width: "1px", height: "60px", backgroundColor: "rgba(255,255,255,0.2)" }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "2.5rem", fontWeight: 700 }}>{commitCount}</div>
          <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>Commits</div>
        </div>
      </div>

      {/* PR Breakdown */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {/* Merged */}
        <div
          className="stat-card clickable"
          style={{
            backgroundColor: "rgba(130, 80, 223, 0.05)",
            textAlign: "center",
            cursor: "pointer",
            ...(stateFilter === "merged"
              ? { borderColor: "#8250df", boxShadow: "0 0 12px #8250df33" }
              : {}),
          }}
          onClick={() => toggleFilter("merged")}
        >
          <div style={{ color: "#8250df", fontWeight: 600, fontSize: "1.3rem" }}>{mergedCount}</div>
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>Merged</div>
        </div>

        {/* Open */}
        <div
          className="stat-card clickable"
          style={{
            backgroundColor: "rgba(9, 105, 218, 0.05)",
            textAlign: "center",
            cursor: "pointer",
            ...(stateFilter === "open"
              ? { borderColor: "#0969da", boxShadow: "0 0 12px #0969da33" }
              : {}),
          }}
          onClick={() => toggleFilter("open")}
        >
          <div style={{ color: "#0969da", fontWeight: 600, fontSize: "1.3rem" }}>{openCount}</div>
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>Open</div>
        </div>

        {/* Closed */}
        <div
          className="stat-card clickable"
          style={{
            backgroundColor: "rgba(207, 34, 46, 0.05)",
            textAlign: "center",
            cursor: "pointer",
            ...(stateFilter === "closed"
              ? { borderColor: "#cf222e", boxShadow: "0 0 12px #cf222e33" }
              : {}),
          }}
          onClick={() => toggleFilter("closed")}
        >
          <div style={{ color: "#cf222e", fontWeight: 600, fontSize: "1.3rem" }}>{closedCount}</div>
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>Closed</div>
        </div>
      </div>

      {/* Code Metrics with Bar Chart */}
      <div className="stat-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              flex: 1,
              height: "28px",
              background: "#f5f5f5",
              borderRadius: "4px",
              overflow: "hidden",
              display: "flex",
            }}
          >
            <div
              style={{
                width: `${addRatio}%`,
                backgroundColor: "#1a7f37",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                color: "white",
                fontWeight: 600,
              }}
            >
              {addRatio > 20 && `${Math.round(addRatio)}%`}
            </div>
            <div
              style={{
                width: `${100 - addRatio}%`,
                backgroundColor: "#cf222e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                color: "white",
                fontWeight: 600,
              }}
            >
              {100 - addRatio > 20 && `${Math.round(100 - addRatio)}%`}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <div style={{ color: "#1a7f37", fontWeight: 600, fontSize: "1.1rem" }}>
              +{totalAdditions.toLocaleString()}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#656d76" }}>Lines Added</div>
          </div>
          <div>
            <div style={{ color: "#cf222e", fontWeight: 600, fontSize: "1.1rem" }}>
              -{totalDeletions.toLocaleString()}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#656d76" }}>Lines Deleted</div>
          </div>
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
