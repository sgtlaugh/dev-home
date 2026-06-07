import React, { useState, useEffect, useMemo, useCallback } from "react";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import { IconGitPullRequest } from "@tabler/icons-react";
import { List, useDynamicRowHeight } from "react-window";
import type { RowComponentProps } from "react-window";
import { GitHubPR } from "../types";
import { fetchPRsByDateRange, fetchCommitCount, fetchUserJoinDate } from "../services/github";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";
import { RepoBreakdown } from "./RepoBreakdown";
import { ContributionHeatmap } from "./ContributionHeatmap";
import { DateRangePicker } from "./DateRangePicker";
import { PRCard } from "./PRCard";
import { PRStats } from "./PRStats";
import {
  VIRTUAL_LIST_ROW_HEIGHT,
  VIRTUAL_LIST_HEIGHT,
  VIRTUAL_LIST_THRESHOLD,
} from "../utils/constants";

export type DateMode = "month" | "year" | "custom";
type StateFilter = "all" | "open" | "merged" | "closed";

type VirtualListItem =
  | { type: "header"; dateLabel: string; count: number }
  | { type: "pr"; pr: GitHubPR };

interface VirtualRowProps {
  items: VirtualListItem[];
  onPRClick: (pr: GitHubPR) => void;
}

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

function VirtualRow({ index, style, items, onPRClick }: RowComponentProps<VirtualRowProps>) {
  const item = items[index];
  return (
    <div style={style}>
      {item.type === "header" ? (
        <div className="activity-date-label">
          {item.dateLabel}
          <Badge
            bg="secondary"
            pill
            style={{ fontSize: "0.7rem", marginLeft: "8px", verticalAlign: "middle" }}
          >
            {item.count}
          </Badge>
        </div>
      ) : (
        <PRCard pr={item.pr} onClick={() => onPRClick(item.pr)} />
      )}
    </div>
  );
}

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

  const { counts, totalAdditions, totalDeletions } = useMemo(() => {
    let merged = 0,
      closed = 0,
      open = 0,
      additions = 0,
      deletions = 0;
    for (const pr of prs) {
      if (pr.merged) merged++;
      else if (pr.state === "closed") closed++;
      else if (pr.state === "open") open++;
      additions += pr.additions || 0;
      deletions += pr.deletions || 0;
    }
    return {
      counts: { all: prs.length, merged, open, closed },
      totalAdditions: additions,
      totalDeletions: deletions,
    };
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

  const virtualListItems = useMemo(() => {
    const items: VirtualListItem[] = [];
    for (const [dateLabel, datePRs] of Array.from(groupedPrs.entries())) {
      items.push({ type: "header", dateLabel, count: datePRs.length });
      for (const pr of datePRs) {
        items.push({ type: "pr", pr });
      }
    }
    return items;
  }, [groupedPrs]);

  const toggleFilter = useCallback(
    (key: StateFilter) => {
      setStateFilter(stateFilter === key ? "all" : key);
    },
    [stateFilter],
  );

  const monthLabel = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const getLabel = () => {
    if (mode === "month") return monthLabel;
    if (mode === "year") return year.toString();
    return startDate && endDate ? `${startDate} to ${endDate}` : "Custom Range";
  };

  const useVirtualization = virtualListItems.length > VIRTUAL_LIST_THRESHOLD;

  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: VIRTUAL_LIST_ROW_HEIGHT,
    key: virtualListItems.length,
  });

  const virtualRowProps = useMemo(
    () => ({ items: virtualListItems, onPRClick: setSelectedPR }),
    [virtualListItems],
  );

  return (
    <div style={{ padding: "1rem" }}>
      <PRStats
        counts={counts}
        commitCount={commitCount}
        totalAdditions={totalAdditions}
        totalDeletions={totalDeletions}
        stateFilter={stateFilter}
        onToggleFilter={toggleFilter}
      />

      {prs.length > 0 && <RepoBreakdown prs={filteredPrs.length > 0 ? filteredPrs : prs} />}

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
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
              paddingBottom: "1rem",
              borderBottom: "1px solid #d1d9e0",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Pull Requests</h3>
            <Badge bg="secondary" pill style={{ fontSize: "0.75rem" }}>
              {filteredPrs.length}
            </Badge>
            {stateFilter !== "all" && (
              <span style={{ fontSize: "0.85rem", color: "#656d76", marginLeft: "0.5rem" }}>
                ({stateFilter})
              </span>
            )}
          </div>
          <div className="activity-timeline">
            {useVirtualization ? (
              <List
                rowCount={virtualListItems.length}
                rowHeight={dynamicRowHeight}
                rowComponent={VirtualRow}
                rowProps={virtualRowProps}
                defaultHeight={VIRTUAL_LIST_HEIGHT}
                style={{ flexGrow: 0 }}
              />
            ) : (
              Array.from(groupedPrs.entries()).map(([dateLabel, datePRs]) => (
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
              ))
            )}
          </div>
        </>
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
