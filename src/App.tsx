import { useState, useEffect } from "react";
import Badge from "react-bootstrap/Badge";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { apiClient } from "./services/config";
import {
  IconRefresh,
  IconSettings,
  IconLayoutDashboard,
  IconNotes,
  IconSubtask,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconChevronsLeft,
  IconChevronsRight,
  IconCalendarStats,
  IconHistory,
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
import { UpdateBanner } from "./components/UpdateBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { FindInPage } from "./components/FindInPage";
import { PRHistory } from "./components/PRHistory";
import { Activity } from "./components/Activity";
import { useActivity } from "./hooks/useActivity";

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
    lastRefreshTime,
  } = useDashboard(configured);
  const {
    notes,
    unresolvedNotes,
    loading: notesLoading,
    addNote,
    editNote,
    resolveNote,
    removeNote,
    refresh: refreshNotes,
  } = useNotes(configured);
  const { updateInfo, dismiss: dismissUpdate } = useUpdateCheck();
  const {
    activities,
    loading: activityLoading,
    refresh: refreshActivity,
  } = useActivity(configured);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [openNote, setOpenNote] = useState<import("./types").Note | null>(null);

  // If config is not yet loaded, show settings first
  const effectiveTab = !configured && !configLoading ? "settings" : activeTab;

  return (
    <>
      <FindInPage />

      <ErrorBoundary>
        <div className="app-body">
          {/* Sidebar navigation */}
          <nav className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
            <div className="sidebar-header">
              <div className="sidebar-actions">
                {loading && <Spinner animation="border" size="sm" variant="secondary" />}
                {!loading && lastRefreshTime && (
                  <span
                    className="text-secondary sidebar-refresh-time"
                    title={`Last refresh: ${new Date(lastRefreshTime).toLocaleString()}`}
                  >
                    {Math.round((Date.now() - lastRefreshTime) / 60000)}m
                  </span>
                )}
                <button
                  className="sidebar-action-btn"
                  onClick={async () => {
                    await apiClient.post("/cache/purge");
                    refresh();
                    refreshNotes();
                    refreshActivity();
                  }}
                  disabled={loading}
                  title="Refresh"
                >
                  <IconRefresh size={14} />
                </button>
                <button
                  className="sidebar-action-btn"
                  onClick={() => setActiveTab("settings")}
                  title="Settings"
                >
                  <IconSettings size={14} />
                </button>
              </div>
            </div>
            {[
              { key: "summary", label: "Overview", icon: IconLayoutDashboard, count: undefined },
              {
                key: "prs",
                label: "Pull Requests",
                icon: IconGitPullRequest,
                count: openPRs.length,
              },
              {
                key: "reviews",
                label: "Review Requests",
                icon: IconEye,
                count: reviewRequests.length,
              },
              { key: "jira", label: "Tasks", icon: IconSubtask, count: jiraIssues.length },
              {
                key: "mentions",
                label: "Notifications",
                icon: IconAt,
                count: jiraComments.length,
              },
              {
                key: "activity",
                label: "Activity",
                icon: IconHistory,
                count: activities.length,
              },
              {
                key: "pr-history",
                label: "Statistics",
                icon: IconCalendarStats,
                count: currentMonthPRsCount,
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
              <Alert variant="danger" className="small" dismissible>
                {error}
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
                {effectiveTab === "activity" && (
                  <Activity activities={activities} loading={activityLoading} />
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
