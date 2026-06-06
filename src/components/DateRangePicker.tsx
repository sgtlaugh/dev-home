import React, { useState, useCallback, useEffect } from "react";
import { CustomDateInputs } from "./CustomDateInputs";

interface DateRangePickerProps {
  joinDate: string | null;
  onDateChange: (start: string, end: string) => void;
  validationError: string | null;
  onValidationError: (error: string | null) => void;
  initialStart?: string;
  initialEnd?: string;
}

const MIN_YEAR = 2000;

function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function DateRangePicker({
  joinDate,
  onDateChange,
  validationError,
  onValidationError,
  initialStart = "",
  initialEnd = "",
}: DateRangePickerProps) {
  const [inputStart, setInputStart] = useState(initialStart);
  const [inputEnd, setInputEnd] = useState(initialEnd);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const applyPreset = useCallback(
    (preset: string) => {
      const today = new Date();
      const toStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const end = toStr(today);
      let start: string;
      if (preset === "30d") {
        const d = new Date(today);
        d.setDate(d.getDate() - 30);
        start = toStr(d);
      } else if (preset === "90d") {
        const d = new Date(today);
        d.setDate(d.getDate() - 90);
        start = toStr(d);
      } else if (preset === "6mo") {
        const d = new Date(today);
        d.setMonth(d.getMonth() - 6);
        start = toStr(d);
      } else if (preset === "1y") {
        const d = new Date(today);
        d.setFullYear(d.getFullYear() - 1);
        start = toStr(d);
      } else {
        start = joinDate || `${MIN_YEAR}-01-01`;
      }
      setInputStart(start);
      setInputEnd(end);
      setSelectedPreset(preset);
      onValidationError(null);
      onDateChange(start, end);
    },
    [joinDate, onDateChange, onValidationError],
  );

  const triggerCustomSearch = useCallback(
    (start?: string, end?: string) => {
      const startVal = start ?? inputStart;
      const endVal = end ?? inputEnd;

      if (!isValidDate(startVal) || !isValidDate(endVal)) {
        onValidationError("Enter valid dates (YYYY-MM-DD)");
        return;
      }
      onValidationError(null);
      setInputStart(startVal);
      setInputEnd(endVal);
      setSelectedPreset(null);
      onDateChange(startVal, endVal);
    },
    [inputStart, inputEnd, onDateChange, onValidationError],
  );

  useEffect(() => {
    if (!hasInitialized && !initialStart && !initialEnd) {
      applyPreset("30d");
      setHasInitialized(true);
    }
  }, [hasInitialized, initialStart, initialEnd, applyPreset]);

  return (
    <div>
      <CustomDateInputs
        inputStart={inputStart}
        inputEnd={inputEnd}
        selectedPreset={selectedPreset}
        onApplyPreset={applyPreset}
        onTriggerSearch={triggerCustomSearch}
      />
      {validationError && (
        <div style={{ color: "#cf222e", fontSize: "0.75rem", marginTop: "8px" }}>
          {validationError}
        </div>
      )}
    </div>
  );
}
