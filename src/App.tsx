import { useState, useEffect } from "react";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import {
  IconCode,
  IconRefresh,
  IconSettings,
  IconPlus,
  IconLayoutDashboard,
  IconColumns3,
  IconNotes,
  IconSubtask,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconChevronsLeft,
  IconChevronsRight,
  IconCalendarStats,
} from "@tabler/icons-react";
import { useConfig } from "./hooks/useConfig";
import { useDashboard } from "./hooks/useDashboard";
import { useNotes } from "./hooks/useNotes";
import { SummaryView } from "./components/SummaryView";
import { JiraTasks } from "./components/JiraTasks";
import { MentionsView } from "./components/MentionsView";
import { PRTable } from "./components/PRTable";
import { PersonalNotes } from "./components/PersonalNotes";
import { NoteEditorModal } from "./components/NoteEditorModal";
import { SettingsView } from "./components/SettingsView";
import packageJson from "../package.json";
import { UpdateBanner } from "./components/UpdateBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { useKanban } from "./hooks/useKanban";
import { KanbanBoard } from "./components/KanbanBoard";
import { FindInPage } from "./components/FindInPage";
import { PRHistory } from "./components/PRHistory";

export default function App() {
  const [activeTab, setActiveTab] = useState("summary");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("dev-home-sidebar-collapsed") === "true";
  });

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("dev-home-sidebar-collapsed", String(next));
  };

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("dev-home-theme") as "dark" | "light") || "light";
  });

  const [currentMonthPRsCount, setCurrentMonthPRsCount] = useState(0);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("dev-home-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Set theme on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const {
    configured,
    loading: configLoading,
    backendOnline,
    jiraBaseUrl,
    githubUsername,
    saveSettings,
  } = useConfig();
  const {
    jiraIssues,
    jiraComments,
    openPRs,
    reviewRequests,
    loading,
    jiraIssuesLoading,
    jiraCommentsLoading,
    openPRsLoading,
    reviewRequestsLoading,
    error,
    refresh,
    rateLimited,
    rateLimitResetAt,
  } = useDashboard(configured);
  const {
    notes,
    unresolvedNotes,
    loading: notesLoading,
    addNote,
    editNote,
    resolveNote,
    unresolveNote,
    removeNote,
    refresh: refreshNotes,
  } = useNotes(configured);
  const {
    columnTiles,
    loading: kanbanLoading,
    doneItemIds,
    moveItem: kanbanMoveItem,
    refresh: refreshKanban,
  } = useKanban({
    active: configured,
    openPRs,
    reviewRequests,
    notes: unresolvedNotes,
    jiraBaseUrl,
    onResolveNote: resolveNote,
    onUnresolveNote: unresolveNote,
  });
  const { updateInfo, dismiss: dismissUpdate } = useUpdateCheck();
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [openNote, setOpenNote] = useState<import("./types").Note | null>(null);

  // If config is not yet loaded, show settings first
  const effectiveTab = !configured && !configLoading ? "settings" : activeTab;

  return (
    <>
      <FindInPage />
      {/* Thin top bar -- draggable for Electron, with app name and refresh */}
      <Navbar className="top-bar" variant="dark">
        <Container
          fluid
          className="px-3"
          style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}
        >
          <div />
          <Navbar.Brand
            className="d-flex align-items-center gap-2 mx-auto mb-0"
            style={{ fontSize: "0.8125rem", fontWeight: 600 }}
          >
            <IconCode size={16} />
            Dev Home ({packageJson.version})
          </Navbar.Brand>
          <div className="d-flex align-items-center gap-2 justify-content-end">
            {loading && <Spinner animation="border" size="sm" variant="secondary" />}
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowNoteEditor(true)}
              title="Add a note"
            >
              <IconPlus size={14} />
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                refresh();
                refreshNotes();
                refreshKanban();
              }}
              disabled={loading || rateLimited}
              title={
                rateLimited
                  ? `Rate limited. Try again ${rateLimitResetAt ? new Date(rateLimitResetAt).toLocaleTimeString() : "later"}`
                  : "Refresh"
              }
            >
              <IconRefresh size={14} />
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={() => setActiveTab("settings")}>
              <IconSettings size={14} />
            </Button>
          </div>
        </Container>
      </Navbar>

      <ErrorBoundary>
        <div className="app-body">
          {/* Sidebar navigation */}
          <nav className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
            {[
              { key: "summary", label: "Summary", icon: IconLayoutDashboard, count: undefined },
              { key: "board", label: "Board", icon: IconColumns3, count: undefined },
              { key: "jira", label: "JIRA Tasks", icon: IconSubtask, count: jiraIssues.length },
              {
                key: "mentions",
                label: "JIRA Mentions",
                icon: IconAt,
                count: jiraComments.length,
              },
              {
                key: "prs",
                label: "PRs",
                icon: IconGitPullRequest,
                count: openPRs.length,
              },
              {
                key: "pr-history",
                label: "PR History",
                icon: IconCalendarStats,
                count: currentMonthPRsCount,
              },
              {
                key: "reviews",
                label: "Reviews",
                icon: IconEye,
                count: reviewRequests.length,
              },
              {
                key: "notes",
                label: "Notes",
                icon: IconNotes,
                count: unresolvedNotes.length,
              },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`sidebar-tab${effectiveTab === tab.key ? " active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
                title={tab.label}
              >
                <tab.icon size={18} />
                <span className="sidebar-tab-label">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <Badge bg="secondary" pill className="sidebar-badge">
                    {tab.count}
                  </Badge>
                )}
              </button>
            ))}
            <button
              className="sidebar-toggle"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <IconChevronsRight size={16} /> : <IconChevronsLeft size={16} />}
            </button>
          </nav>

          {/* Main content panel */}
          <main className="main-content">
            {/* Update banner */}
            {updateInfo && (
              <UpdateBanner
                latestVersion={updateInfo.latestVersion}
                currentVersion={updateInfo.currentVersion}
                downloadUrl={updateInfo.downloadUrl}
                onDismiss={dismissUpdate}
              />
            )}

            {/* Error alert */}
            {error && (
              <Alert variant={rateLimited ? "warning" : "danger"} className="small" dismissible>
                {error}
                {rateLimited && rateLimitResetAt && (
                  <div className="mt-1">
                    Will retry after {new Date(rateLimitResetAt).toLocaleTimeString()}
                  </div>
                )}
              </Alert>
            )}

            {/* Show settings or dashboard */}
            {effectiveTab === "settings" ? (
              <SettingsView
                backendOnline={backendOnline}
                configured={configured}
                jiraBaseUrl={jiraBaseUrl}
                githubUsername={githubUsername}
                onBack={() => setActiveTab("summary")}
                saveSettings={saveSettings}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            ) : (
              <div className="tab-content-area" key={effectiveTab}>
                {effectiveTab === "summary" && (
                  <SummaryView
                    jiraIssues={jiraIssues}
                    jiraComments={jiraComments}
                    openPRs={openPRs}
                    reviewRequests={reviewRequests}
                    loading={loading}
                    jiraIssuesLoading={jiraIssuesLoading}
                    jiraCommentsLoading={jiraCommentsLoading}
                    openPRsLoading={openPRsLoading}
                    reviewRequestsLoading={reviewRequestsLoading}
                    notesLoading={notesLoading}
                    jiraBaseUrl={jiraBaseUrl}
                    onNavigate={setActiveTab}
                    notes={unresolvedNotes}
                    onResolveNote={resolveNote}
                    onAddNote={() => setShowNoteEditor(true)}
                    onOpenNote={(note) => {
                      setOpenNote(note);
                      setShowNoteEditor(true);
                    }}
                    doneItemIds={doneItemIds}
                  />
                )}
                {effectiveTab === "board" && (
                  <KanbanBoard
                    columnTiles={columnTiles}
                    loading={kanbanLoading}
                    jiraBaseUrl={jiraBaseUrl}
                    onMoveItem={kanbanMoveItem}
                  />
                )}
                {effectiveTab === "jira" && (
                  <JiraTasks issues={jiraIssues} loading={loading} baseUrl={jiraBaseUrl} />
                )}
                {effectiveTab === "mentions" && (
                  <MentionsView
                    jiraComments={jiraComments}
                    loading={loading}
                    jiraBaseUrl={jiraBaseUrl}
                  />
                )}
                {effectiveTab === "prs" && (
                  <PRTable prs={openPRs} loading={loading} variant="my-prs" />
                )}
                {effectiveTab === "reviews" && (
                  <PRTable prs={reviewRequests} loading={loading} variant="review-requests" />
                )}
                {effectiveTab === "notes" && (
                  <PersonalNotes
                    notes={notes}
                    loading={notesLoading}
                    onResolve={resolveNote}
                    onDelete={removeNote}
                    onOpenNote={(note) => {
                      setOpenNote(note);
                      setShowNoteEditor(true);
                    }}
                    onAdd={() => setShowNoteEditor(true)}
                    jiraBaseUrl={jiraBaseUrl}
                  />
                )}
                {effectiveTab === "pr-history" && (
                  <PRHistory onCountChange={setCurrentMonthPRsCount} />
                )}
              </div>
            )}
          </main>
        </div>
      </ErrorBoundary>

      <NoteEditorModal
        show={showNoteEditor}
        onHide={() => {
          setShowNoteEditor(false);
          setOpenNote(null);
        }}
        onSave={addNote}
        note={openNote}
        onEdit={editNote}
        jiraBaseUrl={jiraBaseUrl}
      />
    </>
  );
}
