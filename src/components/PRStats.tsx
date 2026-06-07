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

  return (
    <>
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
        onClick={() => onToggleFilter("all")}
      >
        <div>
          <div style={{ fontSize: "2.5rem", fontWeight: 700 }}>{counts.all}</div>
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
          <div style={{ color: "#8250df", fontWeight: 600, fontSize: "1.3rem" }}>
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
          <div style={{ color: "#0969da", fontWeight: 600, fontSize: "1.3rem" }}>{counts.open}</div>
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
          <div style={{ color: "#cf222e", fontWeight: 600, fontSize: "1.3rem" }}>
            {counts.closed}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#656d76", marginTop: "0.3rem" }}>Closed</div>
        </div>
      </div>

      {/* Code Metrics */}
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
    </>
  );
};
