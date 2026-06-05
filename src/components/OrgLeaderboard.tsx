import React, { useState, useEffect, useMemo, useCallback } from "react";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import { useUserOrgs, useOrgLeaderboard } from "../hooks/useOrgLeaderboard";
import { DateRangePicker } from "./DateRangePicker";

type DateMode = "month" | "year" | "custom";
type SortKey = "commits" | "prs" | "reviews";
type SortDir = "asc" | "desc";

const STORAGE_KEY = "org-leaderboard:state";
const MIN_YEAR = 2008;

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveState(state: Record<string, any>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  tooltip,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  tooltip?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(sortKey)}
      title={tooltip}
    >
      {label} {active ? (currentDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );
}

export const OrgLeaderboard: React.FC<{ active: boolean; githubUsername?: string }> = ({
  active,
  githubUsername,
}) => {
  const { orgs, loading: orgsLoading } = useUserOrgs(active);
  const stored = loadState();
  const now = new Date();

  const [org, setOrg] = useState<string | null>(
    stored?.org ?? localStorage.getItem("leaderboard:defaultOrg") ?? null,
  );
  const [mode, setMode] = useState<DateMode>(stored?.mode ?? "month");
  const [year, setYear] = useState(stored?.year ?? now.getFullYear());
  const [month, setMonth] = useState(stored?.month ?? now.getMonth() + 1);
  const [customStart, setCustomStart] = useState(stored?.startDate ?? "");
  const [customEnd, setCustomEnd] = useState(stored?.endDate ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("commits");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleDateChange = useCallback((start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    setMode("custom");
  }, []);

  useEffect(() => {
    if (orgs.length > 0 && !org) setOrg(orgs[0].login);
  }, [orgs, org]);

  useEffect(() => {
    saveState({
      org,
      mode,
      year,
      month,
      startDate: customStart,
      endDate: customEnd,
    });
  }, [org, mode, year, month, customStart, customEnd]);

  const { startDate, endDate } = useMemo(() => {
    if (mode === "month") {
      const m = month.toString().padStart(2, "0");
      const lastDay = new Date(year, month, 0).getDate();
      return {
        startDate: `${year}-${m}-01`,
        endDate: `${year}-${m}-${lastDay.toString().padStart(2, "0")}`,
      };
    }
    if (mode === "year") {
      return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
    }
    return { startDate: customStart, endDate: customEnd };
  }, [mode, year, month, customStart, customEnd]);

  const { members, loading, error } = useOrgLeaderboard(
    active && !validationError,
    org,
    startDate,
    endDate,
  );

  const sorted = useMemo(() => {
    const copy = [...members];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "desc" ? -diff : diff;
    });
    return copy;
  }, [members, sortKey, sortDir]);

  const rankedAndFiltered = useMemo(() => {
    const ranked = sorted.map((m, i) => ({ ...m, rank: i + 1 }));
    if (!search) return ranked;
    const q = search.toLowerCase();
    return ranked.filter(
      (m) => m.login.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q)),
    );
  }, [sorted, search]);

  const maxCommits = useMemo(() => Math.max(1, ...members.map((m) => m.commits)), [members]);
  const maxPRs = useMemo(() => Math.max(1, ...members.map((m) => m.prs)), [members]);
  const maxReviews = useMemo(() => Math.max(1, ...members.map((m) => m.reviews)), [members]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const totalCommits = loading ? 0 : members.reduce((s, m) => s + m.commits, 0);
  const totalPRs = loading ? 0 : members.reduce((s, m) => s + m.prs, 0);
  const totalReviews = loading ? 0 : members.reduce((s, m) => s + m.reviews, 0);

  if (!orgsLoading && orgs.length === 0) {
    return (
      <div className="text-secondary-custom text-center py-5" style={{ fontSize: "0.875rem" }}>
        No GitHub organizations found.{" "}
        <a
          href="https://docs.github.com/en/organizations"
          target="_blank"
          rel="noopener noreferrer"
        >
          Join an organization
        </a>{" "}
        to use the leaderboard.
      </div>
    );
  }

  return (
    <div>
      {/* Stats + Search */}
      <div className="d-flex gap-2 mb-3">
        <div className="stat-card" style={{ backgroundColor: "rgba(26, 127, 55, 0.05)" }}>
          <div className="stat-value" style={{ color: "#1a7f37" }}>
            {totalCommits.toLocaleString()}
          </div>
          <div className="stat-label">Commits</div>
        </div>
        <div className="stat-card" style={{ backgroundColor: "rgba(9, 105, 218, 0.05)" }}>
          <div className="stat-value" style={{ color: "#0969da" }}>
            {totalPRs.toLocaleString()}
          </div>
          <div className="stat-label">PRs</div>
        </div>
        <div className="stat-card" style={{ backgroundColor: "rgba(130, 80, 223, 0.05)" }}>
          <div className="stat-value" style={{ color: "#8250df" }}>
            {totalReviews.toLocaleString()}
          </div>
          <div className="stat-label">Reviews</div>
        </div>
        <div className="stat-card" style={{ backgroundColor: "rgba(88, 166, 255, 0.05)" }}>
          <div className="stat-value" style={{ color: "#656d76" }}>
            {loading ? 0 : members.length}
          </div>
          <div className="stat-label">Members</div>
        </div>
      </div>

      {/* Controls */}
      <Card className="controls-card mb-3">
        <Card.Body className="p-3">
          <div className="d-flex gap-3 align-items-center flex-wrap">
            {/* Org selector */}
            <select
              className="date-dropdown"
              value={org || ""}
              onChange={(e) => setOrg(e.target.value)}
              disabled={orgsLoading}
            >
              {orgsLoading && <option>Loading...</option>}
              {orgs.map((o) => (
                <option key={o.login} value={o.login}>
                  {o.login.charAt(0).toUpperCase() + o.login.slice(1)}
                </option>
              ))}
            </select>
            {/* Mode selector */}
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
                  {Array.from({ length: now.getFullYear() - MIN_YEAR + 1 }, (_, i) => {
                    const y = now.getFullYear() - i;
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
                {Array.from({ length: now.getFullYear() - MIN_YEAR + 1 }, (_, i) => {
                  const y = now.getFullYear() - i;
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
                joinDate={`${MIN_YEAR}-01-01`}
                onDateChange={handleDateChange}
                validationError={validationError}
                onValidationError={setValidationError}
                initialStart={customStart}
                initialEnd={customEnd}
              />
            )}
          </div>
        </Card.Body>
      </Card>

      {members.length > 0 && (
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search by name or login"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="filter-input"
            style={{ fontSize: "0.8rem", padding: "6px 10px", width: "100%" }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="mb-3" style={{ borderColor: "#cf222e" }}>
          <Card.Body style={{ color: "#cf222e" }}>Error: {error}</Card.Body>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" variant="secondary" />
        </div>
      )}

      {/* Table */}
      {!loading && rankedAndFiltered.length > 0 && (
        <Card>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Member</th>
                  <SortHeader
                    label="Commits ⓘ"
                    sortKey="commits"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    tooltip="Commits merged to default branch, not individual PR commits"
                  />
                  <SortHeader
                    label="PRs ⓘ"
                    sortKey="prs"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    tooltip="Number of PRs created"
                  />
                  <SortHeader
                    label="Reviews ⓘ"
                    sortKey="reviews"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    tooltip="Reviews counted across all orgs (GitHub API limitation)"
                  />
                </tr>
              </thead>
              <tbody>
                {rankedAndFiltered.map((m) => {
                  const isMe = githubUsername && m.login === githubUsername;
                  return (
                    <tr
                      key={m.login}
                      style={
                        isMe
                          ? {
                              backgroundColor: "rgba(9, 105, 218, 0.12)",
                              borderLeft: "3px solid #0969da",
                            }
                          : undefined
                      }
                    >
                      <td style={{ color: "#656d76" }}>{m.rank}</td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <img
                            src={m.avatarUrl}
                            alt={m.login}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              border: isMe ? "2px solid #0969da" : "1px solid #d1d9e0",
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: isMe ? 600 : 500 }}>
                              <a
                                href={`https://github.com/${m.login}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {m.login}
                              </a>
                            </div>
                            {m.name && (
                              <div style={{ fontSize: "0.7rem", color: "#656d76" }}>{m.name}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span style={{ minWidth: 36 }}>{m.commits.toLocaleString()}</span>
                          <div
                            className="leaderboard-bar-track"
                            title={`${m.commits} commits (${Math.round((m.commits / maxCommits) * 100)}% of max contributor)`}
                          >
                            <div
                              className="leaderboard-bar-fill"
                              style={{
                                width: `${(m.commits / maxCommits) * 100}%`,
                                backgroundColor: "#1a7f37",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span style={{ minWidth: 36 }}>{m.prs.toLocaleString()}</span>
                          <div
                            className="leaderboard-bar-track"
                            title={`${m.prs} PRs (${Math.round((m.prs / maxPRs) * 100)}% of max contributor)`}
                          >
                            <div
                              className="leaderboard-bar-fill"
                              style={{
                                width: `${(m.prs / maxPRs) * 100}%`,
                                backgroundColor: "#0969da",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span style={{ minWidth: 36 }}>{m.reviews.toLocaleString()}</span>
                          <div
                            className="leaderboard-bar-track"
                            title={`${m.reviews} reviews (${Math.round((m.reviews / maxReviews) * 100)}% of max contributor)`}
                          >
                            <div
                              className="leaderboard-bar-fill"
                              style={{
                                width: `${(m.reviews / maxReviews) * 100}%`,
                                backgroundColor: "#8250df",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Empty */}
      {!loading && !error && members.length === 0 && org && (
        <div className="text-secondary-custom text-center py-5" style={{ fontSize: "0.875rem" }}>
          No data for this period
        </div>
      )}
    </div>
  );
};
