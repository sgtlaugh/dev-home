import React from "react";

type StateFilter = "all" | "open" | "merged" | "closed";

interface PRStatsProps {
  counts: { all: number; merged: number; open: number; closed: number };
  commitCount: number;
  totalAdditions: number;
  totalDeletions: number;
  stateFilter: StateFilter;
  onToggleFilter: (key: StateFilter) => void;
}

export const PRStats: React.FC<PRStatsProps> = ({
  counts,
  commitCount,
  totalAdditions,
  totalDeletions,
  stateFilter,
  onToggleFilter,
}) => {
  const totalLines = totalAdditions + totalDeletions;
  const addRatio = totalLines > 0 ? (totalAdditions / totalLines) * 100 : 0;
  const noData = counts.all === 0 && totalLines === 0;

  return (
    <>
      {/* Hero Stat Card */}
      <div
        className="stat-card clickable"
        style={{
          background: "linear-gradient(135deg, #0969da 0%, #033a99 100%)",
          color: "white",
          padding: "0.75rem 1.25rem",
          borderRadius: "12px",
          marginBottom: "0.75rem",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(9, 105, 218, 0.2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
        onClick={() => onToggleFilter("all")}
      >
        <div style={{ textAlign: "right", flex: 1 }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.2 }}>{counts.all}</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>Pull Requests</div>
        </div>
        <div
          style={{
            width: "1px",
            height: "32px",
            backgroundColor: "rgba(255,255,255,0.2)",
            margin: "0 1.25rem",
          }}
        />
        <div style={{ textAlign: "left", flex: 1 }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.2 }}>{commitCount}</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>Commits</div>
        </div>
      </div>

      {/* PR Breakdown */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
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
          onClick={() => onToggleFilter("merged")}
        >
          <div style={{ color: "#8250df", fontWeight: 600, fontSize: "1.35rem" }}>
            {counts.merged}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>Merged</div>
        </div>

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
          onClick={() => onToggleFilter("open")}
        >
          <div style={{ color: "#0969da", fontWeight: 600, fontSize: "1.35rem" }}>
            {counts.open}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>Open</div>
        </div>

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
          onClick={() => onToggleFilter("closed")}
        >
          <div style={{ color: "#cf222e", fontWeight: 600, fontSize: "1.35rem" }}>
            {counts.closed}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>Closed</div>
        </div>
      </div>

      {/* Code Metrics */}
      <div className="stat-card" style={{ padding: "0.75rem 1rem 0.4rem", marginBottom: "1rem" }}>
        <div
          style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <div
            style={{
              flex: 1,
              height: "14px",
              background: "#f5f5f5",
              borderRadius: "4px",
              overflow: "hidden",
              display: "flex",
            }}
          >
            {noData ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: "#d1d9e0",
                  borderRadius: "4px",
                }}
              />
            ) : (
              <>
                <div
                  style={{
                    width: `${addRatio}%`,
                    backgroundColor: "#1a7f37",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.55rem",
                    color: "white",
                    fontWeight: 600,
                    transition: "width 0.4s ease",
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
                    fontSize: "0.55rem",
                    color: "white",
                    fontWeight: 600,
                    transition: "width 0.4s ease",
                  }}
                >
                  {100 - addRatio > 20 && `${Math.round(100 - addRatio)}%`}
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center" }}>
          <div>
            <span style={{ color: "#1a7f37", fontWeight: 600, fontSize: "0.8rem" }}>
              +{totalAdditions.toLocaleString()}
            </span>{" "}
            <span style={{ fontSize: "0.65rem", color: "#656d76" }}>added</span>
          </div>
          <div>
            <span style={{ color: "#cf222e", fontWeight: 600, fontSize: "0.8rem" }}>
              -{totalDeletions.toLocaleString()}
            </span>{" "}
            <span style={{ fontSize: "0.65rem", color: "#656d76" }}>removed</span>
          </div>
        </div>
      </div>
    </>
  );
};
