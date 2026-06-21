import React from "react";

type StateFilter = "all" | "open" | "merged" | "closed";

interface PRStatsProps {
  counts: { all: number; merged: number; open: number; closed: number };
  commitCount: number;
  reviewCount: number;
  totalAdditions: number;
  totalDeletions: number;
  stateFilter: StateFilter;
  onToggleFilter: (key: StateFilter) => void;
}

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

function Donut({
  segments,
  size = 80,
  strokeWidth = 12,
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let accumulated = 0;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0;
    const dashArray = `${circ * pct} ${circ * (1 - pct)}`;
    const dashOffset = -circ * accumulated;
    accumulated += pct;
    return { ...seg, dashArray, dashOffset };
  });

  return (
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
              style={{ transition: "stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease" }}
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
            fontSize: total > 99999 ? "0.7rem" : total > 9999 ? "0.8rem" : "1rem",
            fontWeight: 700,
            lineHeight: 1.2,
            color: "#24292f",
          }}
        >
          {total.toLocaleString()}
        </div>
        <div style={{ fontSize: "0.55rem", color: "#656d76", fontWeight: 500 }}>Total</div>
      </div>
    </div>
  );
}

function Legend({
  segments,
  onClick,
  activeLabel,
}: {
  segments: DonutSegment[];
  onClick?: (label: string) => void;
  activeLabel?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {segments.map((seg) => {
        const isActive = activeLabel === seg.label;
        return (
          <div
            key={seg.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              cursor: onClick ? "pointer" : undefined,
              opacity: activeLabel && !isActive ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
            onClick={() => onClick?.(seg.label)}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: seg.color,
                flexShrink: 0,
                boxShadow: isActive ? `0 0 6px ${seg.color}66` : undefined,
              }}
            />
            <span
              style={{ fontSize: "0.75rem", color: "#656d76", minWidth: 52, textAlign: "left" }}
            >
              {seg.label}
            </span>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#24292f" }}>
              {seg.value.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const PRStats: React.FC<PRStatsProps> = ({
  counts,
  commitCount,
  reviewCount,
  totalAdditions,
  totalDeletions,
  stateFilter,
  onToggleFilter,
}) => {
  const totalLines = totalAdditions + totalDeletions;
  const addPct = totalLines > 0 ? (totalAdditions / totalLines) * 100 : 0;
  const delPct = totalLines > 0 ? (totalDeletions / totalLines) * 100 : 0;

  const contribSegments: DonutSegment[] = [
    { label: "PRs", value: counts.all, color: "#0969da" },
    { label: "Reviews", value: reviewCount, color: "#8250df" },
    { label: "Commits", value: commitCount, color: "#1a7f37" },
  ];

  const stateSegments: DonutSegment[] = [
    { label: "Merged", value: counts.merged, color: "#5a32a3" },
    { label: "Open", value: counts.open, color: "#0969da" },
    { label: "Closed", value: counts.closed, color: "#bf5540" },
  ];

  const filterMap: Record<string, StateFilter> = {
    Merged: "merged",
    Open: "open",
    Closed: "closed",
  };

  const activeLabel =
    stateFilter !== "all"
      ? stateSegments.find((s) => filterMap[s.label] === stateFilter)?.label
      : undefined;

  return (
    <div
      className="stat-card"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0.75rem 1.25rem",
        marginBottom: "0.75rem",
        gap: "1.25rem",
      }}
    >
      {/* Contribution Pie */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
        <Donut segments={contribSegments} />
        <Legend segments={contribSegments} />
      </div>

      <div style={{ width: 1, height: 56, backgroundColor: "#d1d9e0", flexShrink: 0 }} />

      {/* PR State Pie */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
        <Donut segments={stateSegments} />
        <Legend
          segments={stateSegments}
          onClick={(label) => onToggleFilter(filterMap[label] || "all")}
          activeLabel={activeLabel}
        />
      </div>

      <div style={{ width: 1, height: 56, backgroundColor: "#d1d9e0", flexShrink: 0 }} />

      {/* Code Metrics */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
          flex: 1,
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#1a7f37",
              minWidth: 70,
              textAlign: "right",
            }}
          >
            +{totalAdditions.toLocaleString()}
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              backgroundColor: "#f0f0f0",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${addPct}%`,
                backgroundColor: "#1a7f37",
                borderRadius: 4,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#cf222e",
              minWidth: 70,
              textAlign: "right",
            }}
          >
            -{totalDeletions.toLocaleString()}
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              backgroundColor: "#f0f0f0",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${delPct}%`,
                backgroundColor: "#cf222e",
                borderRadius: 4,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
