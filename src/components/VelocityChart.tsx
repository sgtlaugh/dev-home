import React, { useState, useRef, useEffect } from "react";

interface WeekData {
  weekRange: string;
  value: number;
}

interface VelocityChartProps {
  weeks: WeekData[];
  color: string;
  label: string;
}

const PADDING = { top: 16, right: 16, bottom: 48, left: 40 };

export const VelocityChart: React.FC<VelocityChartProps> = ({ weeks, color, label }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const reversed = [...weeks].reverse();
  const height = 160;
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const maxVal = Math.max(1, ...reversed.map((w) => w.value));
  const yTicks = getYTicks(maxVal);
  const yMax = yTicks[yTicks.length - 1];

  const groupW = chartW / reversed.length;
  const barW = Math.min(groupW * 0.6, 28);

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        {/* Y-axis grid lines + labels */}
        {yTicks.map((tick) => {
          const y = PADDING.top + chartH - (tick / yMax) * chartH;
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={y}
                y2={y}
                stroke="var(--bs-border-color)"
                strokeDasharray="3,3"
                strokeWidth={0.5}
              />
              <text x={PADDING.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#656d76">
                {tick}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {reversed.map((week, i) => {
          const cx = PADDING.left + groupW * i + groupW / 2;
          const barH = (week.value / yMax) * chartH;
          const isZero = week.value === 0;
          const displayH = isZero ? 3 : barH;

          return (
            <g key={i}>
              <rect
                x={cx - barW / 2}
                y={PADDING.top + chartH - displayH}
                width={barW}
                height={displayH}
                rx={2}
                fill={color}
                opacity={isZero ? 0.25 : 0.85}
                onMouseEnter={(e) =>
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${week.weekRange}\n${label}: ${week.value}`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: "default" }}
              />

              {/* X-axis label */}
              <text
                x={cx}
                y={height - PADDING.bottom + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#656d76"
                transform={
                  reversed.length > 8
                    ? `rotate(-30, ${cx}, ${height - PADDING.bottom + 14})`
                    : undefined
                }
              >
                {shortLabel(week.weekRange)}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={PADDING.left}
          x2={width - PADDING.right}
          y1={PADDING.top + chartH}
          y2={PADDING.top + chartH}
          stroke="var(--bs-border-color)"
          strokeWidth={1}
        />
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            backgroundColor: "var(--bs-body-bg, #fff)",
            border: "1px solid var(--bs-border-color)",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: "0.75rem",
            whiteSpace: "pre-line",
            pointerEvents: "none",
            zIndex: 1000,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
};

function shortLabel(weekRange: string): string {
  const parts = weekRange.split(" - ");
  return parts[0] || weekRange;
}

function getYTicks(max: number): number[] {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const targetTicks = 4;
  let step = 1;
  for (const s of steps) {
    if (max / s <= targetTicks) {
      step = s;
      break;
    }
  }
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) {
    ticks.push(v);
  }
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
