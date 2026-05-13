import React, { useState, useEffect } from "react";
import { IconGitPullRequest } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { fetchPRsByMonth } from "../services/github";
import { GroupedPRTable } from "./GroupedPRTable";
import { EmptyState } from "./EmptyState";

export const PRsByMonth: React.FC = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [stateFilter, setStateFilter] = useState<"all" | "open" | "merged" | "closed">("all");
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPRs = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPRsByMonth(year, month);
        setPrs(data);
      } catch (err) {
        setError(`Failed to load PRs: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    };

    loadPRs();
  }, [year, month]);

  const monthName = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const filteredPrs = prs.filter((pr) => {
    if (stateFilter === "all") return true;
    if (stateFilter === "merged") return pr.merged;
    if (stateFilter === "open") return pr.state === "open" && !pr.merged;
    if (stateFilter === "closed") return pr.state === "closed" && !pr.merged;
    return true;
  });

  return (
    <div style={{ padding: "1rem" }}>
      <div className="d-flex gap-3 mb-4 align-items-center">
        <label style={{ marginBottom: 0 }}>
          <span style={{ fontWeight: 500, marginRight: "0.5rem" }}>Year:</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            min="2010"
            max={new Date().getFullYear() + 1}
            style={{
              width: "100px",
              padding: "0.25rem 0.5rem",
              borderRadius: "0.25rem",
              border: "1px solid var(--bs-border-color)",
            }}
          />
        </label>

        <label style={{ marginBottom: 0 }}>
          <span style={{ fontWeight: 500, marginRight: "0.5rem" }}>Month:</span>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            style={{
              padding: "0.25rem 0.5rem",
              borderRadius: "0.25rem",
              border: "1px solid var(--bs-border-color)",
              minWidth: "120px",
            }}
          >
            {[
              "January",
              "February",
              "March",
              "April",
              "May",
              "June",
              "July",
              "August",
              "September",
              "October",
              "November",
              "December",
            ].map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label style={{ marginBottom: 0 }}>
          <span style={{ fontWeight: 500, marginRight: "0.5rem" }}>Status:</span>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
            style={{
              padding: "0.25rem 0.5rem",
              borderRadius: "0.25rem",
              border: "1px solid var(--bs-border-color)",
              minWidth: "100px",
            }}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="merged">Merged</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="alert alert-danger small" role="alert">
          {error}
        </div>
      )}

      {!loading && filteredPrs.length === 0 ? (
        <EmptyState
          icon={<IconGitPullRequest size={40} stroke={1.5} />}
          title={
            prs.length === 0
              ? `No pull requests in ${monthName}`
              : `No ${stateFilter} pull requests in ${monthName}`
          }
          description={
            prs.length === 0
              ? "No pull requests were opened in this month."
              : `No ${stateFilter} pull requests were opened in this month.`
          }
        />
      ) : (
        <GroupedPRTable
          prs={filteredPrs}
          loading={loading}
          columnCount={6}
          headers={
            <>
              <th>PR</th>
              <th>Title</th>
              <th>Repository</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Created</th>
            </>
          }
          renderRow={(pr, onClick) => (
            <tr key={pr.id} onClick={onClick} style={{ cursor: "pointer" }}>
              <td>
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-custom"
                  style={{ fontWeight: 500, whiteSpace: "nowrap" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  #{pr.number}
                </a>
              </td>
              <td>
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-truncate-custom d-block"
                  style={{ fontWeight: 500, maxWidth: 360 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {pr.title}
                </a>
              </td>
              <td>
                <span className="badge badge-status-neutral">{pr.repo_full_name}</span>
              </td>
              <td>
                <div className="d-flex align-items-center gap-1">
                  <span className="branch-tag">{pr.head.ref}</span>
                  <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                    {"\u2192"}
                  </span>
                  <span className="branch-tag">{pr.base.ref}</span>
                </div>
              </td>
              <td>
                <div className="d-flex align-items-center gap-2">
                  {pr.draft && <span className="badge badge-status-neutral">Draft</span>}
                  {pr.merged ? (
                    <span className="badge badge-status-purple">Merged</span>
                  ) : pr.state === "open" ? (
                    <span className="badge badge-status-green">Open</span>
                  ) : (
                    <span className="badge badge-status-red">Closed</span>
                  )}
                </div>
              </td>
              <td>
                <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
                  {new Date(pr.created_at).toLocaleDateString()}
                </span>
              </td>
            </tr>
          )}
        />
      )}
    </div>
  );
};
