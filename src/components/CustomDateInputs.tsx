import React, { memo, useRef } from "react";

interface CustomDateInputsProps {
  inputStart: string;
  inputEnd: string;
  selectedPreset: string | null;
  onApplyPreset: (key: string) => void;
  onTriggerSearch: (start?: string, end?: string) => void;
}

export const CustomDateInputs = memo(
  ({
    inputStart,
    inputEnd,
    selectedPreset,
    onApplyPreset,
    onTriggerSearch,
  }: CustomDateInputsProps) => {
    const startRef = useRef<HTMLInputElement>(null);
    const endRef = useRef<HTMLInputElement>(null);

    const handleTrigger = () => {
      const start = startRef.current?.value || "";
      const end = endRef.current?.value || "";
      onTriggerSearch(start, end);
    };

    return (
      <div className="d-flex gap-2 align-items-center flex-wrap">
        {[
          { key: "30d", label: "30 days" },
          { key: "90d", label: "90 days" },
          { key: "6mo", label: "6 months" },
          { key: "1y", label: "1 year" },
          { key: "alltime", label: "All Time" },
        ].map((p) => (
          <button
            key={p.key}
            className="activity-filter-chip"
            style={
              selectedPreset === p.key ? { borderColor: "#0969da", color: "#0969da" } : undefined
            }
            onClick={() => onApplyPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        <span style={{ color: "#d1d9e0", fontSize: "0.75rem" }}>|</span>
        <input
          ref={startRef}
          key={`start-${inputStart}`}
          type="text"
          placeholder="YYYY-MM-DD"
          defaultValue={inputStart}
          onKeyDown={(e) => e.key === "Enter" && handleTrigger()}
          className="filter-input"
          style={{ fontSize: "0.75rem", padding: "4px 8px", width: "120px" }}
        />
        <span style={{ color: "#656d76", fontSize: "0.75rem" }}>→</span>
        <input
          ref={endRef}
          key={`end-${inputEnd}`}
          type="text"
          placeholder="YYYY-MM-DD"
          defaultValue={inputEnd}
          onKeyDown={(e) => e.key === "Enter" && handleTrigger()}
          className="filter-input"
          style={{ fontSize: "0.75rem", padding: "4px 8px", width: "120px" }}
        />
        <button
          className="segmented-btn active"
          style={{ fontSize: "0.7rem", padding: "4px 10px" }}
          onClick={handleTrigger}
        >
          Go
        </button>
      </div>
    );
  },
);
CustomDateInputs.displayName = "CustomDateInputs";
