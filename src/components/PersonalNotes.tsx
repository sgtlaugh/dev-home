import React, { useState, useMemo, useEffect, useRef } from "react";
import Spinner from "react-bootstrap/Spinner";
import {
  IconNote,
  IconBrandJira,
  IconGitPullRequest,
  IconLink,
  IconCheck,
  IconTrash,
  IconPlus,
  IconClipboardText,
} from "@tabler/icons-react";
import { SearchBox } from "./SearchBox";
import { Note } from "../types";
import { getReferenceUrl, getNoteDisplayTitle } from "../utils/text";
import { Tooltip } from "./Tooltip";

interface NoteFilters {
  new: boolean;
  resolved: boolean;
}

type SubTab = "notes" | "standups";

interface PersonalNotesProps {
  notes: Note[];
  loading: boolean;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpenNote: (note: Note) => void;
  onAdd: () => void;
  onGenerateStandup?: () => void;
  generatingStandup?: boolean;
  jiraBaseUrl: string;
  active?: boolean;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  free_text: { icon: <IconNote size={14} stroke={1.8} />, color: "#656d76" },
  jira_ticket: { icon: <IconBrandJira size={14} stroke={1.8} />, color: "#0052CC" },
  github_pr: { icon: <IconGitPullRequest size={14} stroke={1.8} />, color: "#1a7f37" },
  link: { icon: <IconLink size={14} stroke={1.8} />, color: "#8250df" },
};

export const PersonalNotes: React.FC<PersonalNotesProps> = ({
  notes,
  loading,
  onResolve,
  onDelete,
  onOpenNote,
  onAdd,
  onGenerateStandup,
  generatingStandup,
  jiraBaseUrl,
  active,
}) => {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<NoteFilters>({ new: true, resolved: false });
  const [subTab, setSubTab] = useState<SubTab>("notes");
  const prevActive = useRef(active);

  useEffect(() => {
    if (active && !prevActive.current) {
      setFilters({ new: true, resolved: false });
      setSearch("");
    }
    prevActive.current = active;
  }, [active]);

  const categoryNotes = useMemo(
    () =>
      notes.filter((n) => (n.category ?? "note") === (subTab === "standups" ? "standup" : "note")),
    [notes, subTab],
  );

  const searched = useMemo(() => {
    if (!search) return categoryNotes;
    const q = search.toLowerCase();
    return categoryNotes.filter((n) => {
      const title = getNoteDisplayTitle(n).toLowerCase();
      const content = (n.content || "").toLowerCase();
      return title.includes(q) || content.includes(q);
    });
  }, [categoryNotes, search]);

  if (loading && notes.length === 0) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  const newNotes = searched
    .filter((n) => n.resolved === 0)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const resolvedNotes = searched
    .filter((n) => n.resolved === 1)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const toggleFilter = (key: keyof NoteFilters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="notes-container">
      <div className="notes-header">
        <h2 className="notes-title">Daily Planner</h2>
        {subTab === "notes" ? (
          <button className="notes-add-btn" onClick={onAdd}>
            <IconPlus size={18} />
            <span>Add</span>
          </button>
        ) : (
          <button
            className="notes-add-btn"
            onClick={onGenerateStandup}
            disabled={generatingStandup}
          >
            {generatingStandup ? (
              <Spinner animation="border" size="sm" />
            ) : (
              <IconClipboardText size={18} />
            )}
            <span>{generatingStandup ? "Generating..." : "Generate Note"}</span>
          </button>
        )}
      </div>

      <div className="notes-subtab-row">
        <button
          className={`notes-subtab${subTab === "notes" ? " active" : ""}`}
          onClick={() => setSubTab("notes")}
        >
          Notes
        </button>
        <button
          className={`notes-subtab${subTab === "standups" ? " active" : ""}`}
          onClick={() => setSubTab("standups")}
        >
          Standups
        </button>
      </div>

      <div className="notes-divider" />

      <div className="notes-filter-row">
        <button
          className={`activity-filter-chip${filters.new ? " active" : ""}`}
          style={
            filters.new ? { backgroundColor: "#0969da", borderColor: "transparent" } : undefined
          }
          onClick={() => toggleFilter("new")}
        >
          New
          <span className="activity-filter-count">{newNotes.length}</span>
        </button>
        <button
          className={`activity-filter-chip${filters.resolved ? " active" : ""}`}
          style={
            filters.resolved
              ? { backgroundColor: "#1a7f37", borderColor: "transparent" }
              : undefined
          }
          onClick={() => toggleFilter("resolved")}
        >
          Resolved
          <span className="activity-filter-count">{resolvedNotes.length}</span>
        </button>
      </div>

      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Search notes..."
        className="flex-1 mb-3"
      />

      {filters.new && newNotes.length > 0 && (
        <div className="notes-section">
          <div className="notes-section-label notes-section-label-new">New</div>
          <div className="notes-list">
            {newNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                jiraBaseUrl={jiraBaseUrl}
                onResolve={onResolve}
                onDelete={onDelete}
                onOpenNote={onOpenNote}
              />
            ))}
          </div>
        </div>
      )}

      {filters.resolved && resolvedNotes.length > 0 && (
        <div className="notes-section">
          <div className="notes-section-label notes-section-label-resolved">Resolved</div>
          <div className="notes-list">
            {resolvedNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                jiraBaseUrl={jiraBaseUrl}
                onResolve={onResolve}
                onDelete={onDelete}
                onOpenNote={onOpenNote}
              />
            ))}
          </div>
        </div>
      )}

      {(!filters.new || newNotes.length === 0) &&
        (!filters.resolved || resolvedNotes.length === 0) && (
          <div className="notes-empty-filter">
            {!filters.new && !filters.resolved
              ? "Select a filter to view notes"
              : `No notes${search ? " matching your search" : ""}`}
          </div>
        )}
    </div>
  );
};

function NoteRow({
  note,
  jiraBaseUrl,
  onResolve,
  onDelete,
  onOpenNote,
}: {
  note: Note;
  jiraBaseUrl: string;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpenNote: (note: Note) => void;
}) {
  const url = getReferenceUrl(note, jiraBaseUrl);
  const title = getNoteDisplayTitle(note);
  const config = TYPE_CONFIG[note.type] || TYPE_CONFIG.free_text;

  return (
    <div className="note-row" onClick={() => onOpenNote(note)}>
      <div className="note-row-accent" style={{ backgroundColor: config.color }} />
      <div className="note-row-icon" style={{ color: config.color }}>
        {config.icon}
      </div>
      <div className="note-row-body">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="note-row-title"
            onClick={(e) => e.stopPropagation()}
          >
            {title}
          </a>
        ) : (
          <span className="note-row-title">{title}</span>
        )}
        {note.content && <div className="note-row-content">{note.content}</div>}
      </div>
      <div className="note-row-actions">
        {note.resolved === 0 && (
          <Tooltip text="Resolve">
            <button
              className="note-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onResolve(note.id);
              }}
            >
              <IconCheck size={13} />
            </button>
          </Tooltip>
        )}
        <Tooltip text="Delete">
          <button
            className="note-action-btn note-action-delete"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("Are you sure you want to delete this note?")) {
                onDelete(note.id);
              }
            }}
          >
            <IconTrash size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
