import React, { useState, useCallback, useEffect } from "react";
import Card from "react-bootstrap/Card";
import { DateRangePicker } from "./DateRangePicker";

export type DateMode = "month" | "year" | "custom";

const MIN_YEAR = 2000;

export interface DateModeInfo {
  mode: DateMode;
  year: number;
  month: number;
}

interface DateControlsProps {
  joinDate?: string | null;
  onDateChange: (start: string, end: string) => void;
  onModeInfo?: (info: DateModeInfo) => void;
  defaultMode?: DateMode;
  className?: string;
}

function computeRange(
  mode: DateMode,
  year: number,
  month: number,
): { start: string; end: string } | null {
  if (mode === "month") {
    const monthStr = month.toString().padStart(2, "0");
    const start = `${year}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${monthStr}-${lastDay.toString().padStart(2, "0")}`;
    return { start, end };
  } else if (mode === "year") {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return null;
}

export function DateControls({
  joinDate,
  onDateChange,
  onModeInfo,
  defaultMode = "month",
  className = "mb-4",
}: DateControlsProps) {
  const now = new Date();
  const [mode, setMode] = useState<DateMode>(defaultMode);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleCustomDateChange = useCallback((start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    setMode("custom");
  }, []);

  // Emit date range on mode/month/year change (and on mount)
  useEffect(() => {
    if (mode === "custom") {
      if (customStart && customEnd) {
        onDateChange(customStart, customEnd);
        onModeInfo?.({ mode: "custom", year, month });
      }
      return;
    }
    const range = computeRange(mode, year, month);
    if (range) {
      onDateChange(range.start, range.end);
      onModeInfo?.({ mode, year, month });
    }
  }, [mode, year, month, customStart, customEnd, onDateChange, onModeInfo]);

  return (
    <Card className={`controls-card ${className}`}>
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
                {Array.from({ length: new Date().getFullYear() - MIN_YEAR + 1 }, (_, i) => {
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
              {Array.from({ length: new Date().getFullYear() - MIN_YEAR + 1 }, (_, i) => {
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
              joinDate={joinDate ?? `${MIN_YEAR}-01-01`}
              onDateChange={handleCustomDateChange}
              validationError={validationError}
              onValidationError={setValidationError}
              initialStart={customStart}
              initialEnd={customEnd}
            />
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
