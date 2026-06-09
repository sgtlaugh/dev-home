import React from "react";
import { IconSearch } from "@tabler/icons-react";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchBox: React.FC<SearchBoxProps> = ({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}) => (
  <div className={`search-box ${className}`}>
    <IconSearch size={14} style={{ color: "#656d76", flexShrink: 0 }} />
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="search-box-input"
    />
  </div>
);
