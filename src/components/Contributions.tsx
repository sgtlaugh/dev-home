import React, { useState, useEffect, useMemo, useCallback } from "react";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import { IconGitPullRequest } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { fetchPRsByDateRange, fetchCommitCount, fetchUserJoinDate } from "../services/github";
import { EmptyState } from "./EmptyState";
import { RepoBreakdown } from "./RepoBreakdown";
import { ContributionHeatmap } from "./ContributionHeatmap";
import { DateControls, DateModeInfo } from "./DateControls";
import { PRListTable } from "./PRListTable";
import { PRStats } from "./PRStats";

type StateFilter = "all" | "open" | "merged" | "closed";

interface ContributionsProps {
  onCountChange?: (count: number) => void;
  active?: boolean;
  onFetchComplete?: (label: string, ms: number) => void;
}

export const Contributions: React.FC<ContributionsProps> = ({
  onCountChange,
  active = true,
  onFetchComplete,
}) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [modeInfo, setModeInfo] = useState<DateModeInfo>({
    mode: "month",
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [commitCount, setCommitCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinDate, setJoinDate] = useState<string | null>(null);

  const handleDateChange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const abortRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    fetchUserJoinDate()
      .then(setJoinDate)
      .catch(() => setJoinDate(null));
  }, []);

  useEffect(() => {
    if (!active) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const loadPRs = async () => {
      if (!startDate || !endDate) {
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
      onFetchComplete?.("Contributions", -1);
      const start = Date.now();
      try {
        const [prsResult, commits] = await Promise.all([
          fetchPRsByDateRange(startDate, endDate, signal),
          fetchCommitCount(startDate, endDate, signal),
        ]);
        if (signal.aborted) return;
        setPrs(prsResult);
        setCommitCount(commits);
        onCountChange?.(prsResult.length);
        onFetchComplete?.("Contributions", Date.now() - start);
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
  }, [startDate, endDate, onCountChange, active]);

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

  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());

  const toggleRepo = useCallback((repo: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  }, []);

  const filteredPrs = useMemo(() => {
    const filtered = prs.filter((pr) => {
      if (stateFilter !== "all") {
        if (stateFilter === "merged" && !pr.merged) return false;
        if (stateFilter === "open" && (pr.state !== "open" || pr.merged)) return false;
        if (stateFilter === "closed" && (pr.state !== "closed" || pr.merged)) return false;
      }
      if (selectedRepos.size > 0 && !selectedRepos.has(pr.repo_full_name)) return false;
      return true;
    });
    return [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [prs, stateFilter, selectedRepos]);

  const toggleFilter = useCallback(
    (key: StateFilter) => {
      setStateFilter(stateFilter === key ? "all" : key);
    },
    [stateFilter],
  );

  const getLabel = () => {
    if (modeInfo.mode === "month") {
      return new Date(modeInfo.year, modeInfo.month - 1).toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
    }
    if (modeInfo.mode === "year") return modeInfo.year.toString();
    return startDate && endDate ? `${startDate} to ${endDate}` : "Custom Range";
  };

  return (
    <div>
      {/* Controls */}
      <DateControls joinDate={joinDate} onDateChange={handleDateChange} onModeInfo={setModeInfo} />

      <PRStats
        counts={counts}
        commitCount={commitCount}
        totalAdditions={totalAdditions}
        totalDeletions={totalDeletions}
        stateFilter={stateFilter}
        onToggleFilter={toggleFilter}
      />

      {prs.length > 0 && (
        <RepoBreakdown prs={prs} selectedRepos={selectedRepos} onToggleRepo={toggleRepo} />
      )}

      {prs.length > 0 && (
        <ContributionHeatmap
          prs={prs}
          mode={modeInfo.mode}
          year={modeInfo.year}
          month={modeInfo.month}
          selectedStart={startDate}
          selectedEnd={endDate}
        />
      )}

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

      {!loading && startDate && endDate && filteredPrs.length === 0 ? (
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
          <PRListTable prs={filteredPrs} />
        </>
      )}
    </div>
  );
};
