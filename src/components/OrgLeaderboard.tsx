import React, { useState, useEffect, useMemo, useCallback } from "react";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import { useUserOrgs, useOrgLeaderboard, usePrefetchStatus } from "../hooks/useOrgLeaderboard";
import { DateControls } from "./DateControls";

type SortKey = "commits" | "prs" | "reviews";
type SortDir = "asc" | "desc";

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

  const [org, setOrg] = useState<string | null>(
    localStorage.getItem("leaderboard:defaultOrg") ?? null,
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("commits");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const handleDateChange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  useEffect(() => {
    if (orgs.length > 0 && !org) setOrg(orgs[0].login);
  }, [orgs, org]);

  const prefetch = usePrefetchStatus(active);
  const { members, loading, error } = useOrgLeaderboard(active, org, startDate, endDate);

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
      {/* Controls */}
      <DateControls joinDate="2008-01-01" onDateChange={handleDateChange} className="mb-3" />

      {/* Stats Donut + My Stats */}
      {(() => {
        const total = totalCommits + totalPRs + totalReviews;
        const memberCount = loading ? 0 : members.length;
        const segments = [
          { label: "Commits", value: totalCommits, color: "#1a7f37" },
          { label: "PRs", value: totalPRs, color: "#0969da" },
          { label: "Reviews", value: totalReviews, color: "#8250df" },
        ];
        const size = 100;
        const strokeWidth = 14;
        const radius = (size - strokeWidth) / 2;
        const circ = 2 * Math.PI * radius;

        let accumulated = 0;
        const arcs = segments.map((seg) => {
          const pct = total > 0 ? seg.value / total : 0;
          const dashArray = `${circ * pct} ${circ * (1 - pct)}`;
          const dashOffset = -circ * accumulated;
          accumulated += pct;
          return { ...seg, dashArray, dashOffset };
        });

        const me =
          !loading && githubUsername ? sorted.find((m) => m.login === githubUsername) : null;
        const myRank = me ? sorted.findIndex((m) => m.login === githubUsername) + 1 : null;
        const myStats = me
          ? [
              { label: "Commits", value: me.commits, color: "#1a7f37", max: maxCommits },
              { label: "PRs", value: me.prs, color: "#0969da", max: maxPRs },
              { label: "Reviews", value: me.reviews, color: "#8250df", max: maxReviews },
            ]
          : [];

        return (
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            {/* Org Totals */}
            <div
              className="stat-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1.5rem",
                padding: "1rem 1.5rem",
                flex: 1,
              }}
            >
              <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
                <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                  {total === 0 ? (
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke="#d1d9e0"
                      strokeWidth={strokeWidth}
                    />
                  ) : (
                    arcs.map((arc) => (
                      <circle
                        key={arc.label}
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={arc.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={arc.dashArray}
                        strokeDashoffset={arc.dashOffset}
                        style={{
                          transition: "stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease",
                        }}
                      />
                    ))
                  )}
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: total > 999999 ? "0.7rem" : total > 9999 ? "0.85rem" : "1.1rem",
                      fontWeight: 700,
                      lineHeight: 1.2,
                      color: "#24292f",
                    }}
                  >
                    {total.toLocaleString()}
                  </div>
                  <div
                    style={{
                      fontSize: "0.6rem",
                      color: "#656d76",
                      fontWeight: 500,
                      letterSpacing: "0.03em",
                    }}
                  >
                    Total
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
                {segments.map((seg) => (
                  <div
                    key={seg.label}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: seg.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "#656d76",
                        minWidth: 60,
                        width: 60,
                        textAlign: "left",
                      }}
                    >
                      {seg.label}
                    </span>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      {seg.value.toLocaleString()}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginTop: "0.3rem",
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: "#656d76",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#656d76",
                      minWidth: 60,
                      width: 60,
                      textAlign: "left",
                    }}
                  >
                    Members
                  </span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    {memberCount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* My Stats */}
            {me && myRank && (
              <div
                className="stat-card"
                style={{
                  flex: 1,
                  padding: "1rem 1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  background:
                    "linear-gradient(135deg, rgba(9, 105, 218, 0.04) 0%, rgba(130, 80, 223, 0.04) 100%)",
                  borderColor: "rgba(9, 105, 218, 0.15)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <img
                    src={me.avatarUrl}
                    alt={me.login}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "2px solid #0969da",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#24292f" }}>
                      {me.name || me.login}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "#656d76" }}>
                      Rank <span style={{ fontWeight: 700, color: "#0969da" }}>#{myRank}</span> of{" "}
                      {memberCount}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                    flex: 1,
                    justifyContent: "center",
                  }}
                >
                  {myStats.map((stat) => (
                    <div key={stat.label}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "3px",
                        }}
                      >
                        <span style={{ fontSize: "0.75rem", color: "#656d76" }}>{stat.label}</span>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                          {stat.value.toLocaleString()}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          backgroundColor: "#f0f0f0",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${(stat.value / stat.max) * 100}%`,
                            backgroundColor: stat.color,
                            borderRadius: 3,
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {members.length > 0 && (
        <div className="mb-3 d-flex gap-2 align-items-center">
          <select
            className="date-dropdown"
            value={org || ""}
            onChange={(e) => setOrg(e.target.value)}
            disabled={orgsLoading}
            style={{ flex: "0 0 auto" }}
          >
            {orgsLoading && <option>Loading...</option>}
            {orgs.map((o) => (
              <option key={o.login} value={o.login}>
                {o.login.charAt(0).toUpperCase() + o.login.slice(1)}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search by name or login"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="filter-input"
            style={{ fontSize: "0.8rem", padding: "6px 10px", flex: 1 }}
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
        <div className="d-flex flex-column align-items-center py-5">
          <Spinner animation="border" variant="secondary" />
          <div className="text-secondary-custom mt-3" style={{ fontSize: "0.875rem" }}>
            {prefetch.running
              ? `Loading leaderboard... Org caching in progress (${prefetch.percentage}%). Queries will be faster once complete.`
              : "Loading leaderboard... This may take a while for large organizations or date ranges."}
          </div>
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
