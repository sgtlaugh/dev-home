import React, { useState, useRef, useEffect } from "react";

interface WeekData {
  weekRange: string;
  value: number;
}

interface Series {
  data: WeekData[];
  color: string;
  label: string;
}

interface VelocityChartProps {
  weeks?: WeekData[];
  color?: string;
  label?: string;
  series?: Series[];
}

const PADDING = { top: 12, right: 16, bottom: 28, left: 36 };

export const VelocityChart: React.FC<VelocityChartProps> = ({
  weeks,
  color,
  label,
  series: seriesProp,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  const series: Series[] =
    seriesProp || (weeks && color && label ? [{ data: weeks, color, label }] : []);
  const multiSeries = series.length > 1;

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

  const primaryData = [...(series[0]?.data || [])].reverse();
  const height = 150;
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const allValues = series.flatMap((s) => s.data.map((w) => w.value));
  const maxVal = Math.max(1, ...allValues);
  const yTicks = getYTicks(maxVal);
  const yMax = yTicks[yTicks.length - 1];

  const groupW = chartW / primaryData.length;
  const totalBarW = Math.min(groupW * 0.7, multiSeries ? 36 : 28);
  const singleBarW = multiSeries ? totalBarW / series.length : totalBarW;
  const barGap = multiSeries ? 2 : 0;

  // Find peak week index for primary series
  const peakIdx = primaryData.reduce(
    (best, w, i) => (w.value > primaryData[best].value ? i : best),
    0,
  );
  const hasPeak = primaryData.length > 2 && primaryData[peakIdx].value > 0;

  // Moving average (3-week window) for each series
  const trendPointsBySeries = series.map((s) => {
    const reversed = [...s.data].reverse();
    const movingAvg = reversed.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - 1); j <= Math.min(reversed.length - 1, i + 1); j++) {
        sum += reversed[j].value;
        count++;
      }
      return sum / count;
    });
    return movingAvg
      .map((avg, i) => {
        const cx = PADDING.left + groupW * i + groupW / 2;
        const y = PADDING.top + chartH - (avg / yMax) * chartH;
        return `${cx},${y}`;
      })
      .join(" ");
  });

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      {/* Legend for multi-series */}
      {multiSeries && (
        <div
          style={{ display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "0.4rem" }}
        >
          {series.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: s.color,
                  opacity: 0.85,
                }}
              />
              <span style={{ fontSize: "0.7rem", color: "#656d76" }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
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
        {primaryData.map((week, i) => {
          const cx = PADDING.left + groupW * i + groupW / 2;
          const isPeak = hasPeak && i === peakIdx;

          return (
            <g key={i}>
              {/* Peak highlight glow */}
              {isPeak && (
                <rect
                  x={PADDING.left + groupW * i + 2}
                  y={PADDING.top}
                  width={groupW - 4}
                  height={chartH}
                  rx={4}
                  fill={series[0].color}
                  opacity={0.06}
                />
              )}
              {series.map((s, si) => {
                const reversedData = [...s.data].reverse();
                const val = reversedData[i]?.value || 0;
                const barH = (val / yMax) * chartH;
                const isZero = val === 0;
                const displayH = isZero ? 2 : barH;
                const barX = multiSeries
                  ? cx - totalBarW / 2 + si * (singleBarW + barGap)
                  : cx - singleBarW / 2;

                return (
                  <rect
                    key={s.label}
                    x={barX}
                    y={PADDING.top + chartH - displayH}
                    width={singleBarW - barGap}
                    height={displayH}
                    rx={2}
                    fill={s.color}
                    opacity={isZero ? 0.2 : isPeak && si === 0 ? 1 : 0.85}
                    onMouseEnter={(e) => {
                      const lines = series.map((ss) => {
                        const rv = [...ss.data].reverse();
                        return `${ss.label}: ${rv[i]?.value || 0}`;
                      });
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        content: `${week.weekRange}${isPeak ? " ★ Best" : ""}\n${lines.join("\n")}`,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ cursor: "default", transition: "height 0.3s ease, y 0.3s ease" }}
                  />
                );
              })}

              {/* X-axis label */}
              <text
                x={cx}
                y={height - PADDING.bottom + 12}
                textAnchor="middle"
                fontSize={9}
                fill={isPeak ? series[0].color : "#656d76"}
                fontWeight={isPeak ? 600 : 400}
                transform={
                  primaryData.length > 8
                    ? `rotate(-30, ${cx}, ${height - PADDING.bottom + 12})`
                    : undefined
                }
              >
                {shortLabel(week.weekRange)}
              </text>
            </g>
          );
        })}

        {/* Moving average trend lines */}
        {primaryData.length > 2 &&
          series.map((s, si) => (
            <polyline
              key={s.label}
              points={trendPointsBySeries[si]}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeDasharray="4,3"
              opacity={0.6}
              style={{ transition: "all 0.3s ease" }}
            />
          ))}

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
