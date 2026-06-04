import { useState } from "react";
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
  IconChartBar,
  IconUsers,
  IconTrophy,
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
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FindInPage } from "./components/FindInPage";
import { PRHistory } from "./components/PRHistory";
import { Activity } from "./components/Activity";
import { JiraActivity } from "./components/JiraActivity";
import { JiraVelocity } from "./components/JiraVelocity";
import { PeerActivity } from "./components/PeerActivity";
import { OrgLeaderboard } from "./components/OrgLeaderboard";
import { useActivity } from "./hooks/useActivity";
import { usePeerActivity } from "./hooks/usePeerActivity";
import { useGitHubRateLimit } from "./hooks/useGitHubRateLimit";
import { apiCache } from "./utils/cache";

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

  const [currentMonthPRsCount, setCurrentMonthPRsCount] = useState(0);
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
  const {
    activities,
    loading: activityLoading,
    refresh: refreshActivity,
  } = useActivity(configured);
  const { activities: peerActivities, refresh: refreshPeerActivity } = usePeerActivity(configured);
  const { rateLimit } = useGitHubRateLimit(configured);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
            <div className="sidebar-header" />
            {[
              { key: "summary", label: "Overview", icon: IconLayoutDashboard },
              { group: "separator" },
              { group: "label", label: "GitHub" },
              { key: "activity", label: "Activity", icon: IconHistory },
              { key: "peers", label: "Peer Activity", icon: IconUsers },
              { key: "prs", label: "Pull Requests", icon: IconGitPullRequest },
              { key: "reviews", label: "Review Requests", icon: IconEye },
              { key: "pr-history", label: "Statistics", icon: IconCalendarStats },
              { key: "leaderboard", label: "Leaderboard", icon: IconTrophy },
              { group: "separator" },
              { group: "label", label: "JIRA" },
              { key: "jira-activity", label: "Activity", icon: IconHistory },
              { key: "mentions", label: "Notifications", icon: IconAt },
              { key: "jira", label: "Tasks", icon: IconSubtask },
              { key: "velocity", label: "Velocity", icon: IconChartBar },
              { group: "separator" },
              { key: "notes", label: "Notes", icon: IconNotes },
            ].map((item, idx) => {
              if (item.group === "separator") {
                return <div key={`sep-${idx}`} className="sidebar-separator" />;
              }
              if (item.group === "label") {
                return (
                  <div key={item.label} className="sidebar-group-label">
                    {item.label}
                  </div>
                );
              }

              const countMap: Record<string, number | undefined> = {
                prs: openPRs.length,
                reviews: reviewRequests.length,
                peers: peerActivities.length,
                jira: jiraIssues.length,
                mentions: jiraComments.length,
                activity: activities.filter((a) => a.type === "github").length,
                "jira-activity": activities.filter((a) => a.type === "jira").length,
                "pr-history": currentMonthPRsCount,
                notes: unresolvedNotes.length,
              };
              const count = item.key ? countMap[item.key] : undefined;

              if (!item.icon) return null;
              return (
                <button
                  key={item.key}
                  className={`sidebar-tab${effectiveTab === item.key ? " active" : ""}`}
                  onClick={() => setActiveTab(item.key!)}
                  title={item.label}
                >
                  <item.icon size={18} />
                  <span className="sidebar-tab-label">{item.label}</span>
                  {count !== undefined && count > 0 && (
                    <Badge bg="secondary" pill className="sidebar-badge">
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
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
              />
            ) : (
              <>
                <div className="content-header">
                  <div className="content-header-time">
                    {loading && <Spinner animation="border" size="sm" variant="secondary" />}
                    {!loading && lastRefreshTime && (
                      <span
                        className="text-secondary sidebar-refresh-time"
                        title={`Last refresh: ${new Date(lastRefreshTime).toLocaleString()}`}
                      >
                        {Math.round((Date.now() - lastRefreshTime) / 60000)}m
                      </span>
                    )}
                    {rateLimit &&
                      (() => {
                        const pct = rateLimit.remaining / rateLimit.limit;
                        const color = pct > 0.8 ? "#1a7f37" : pct > 0.5 ? "#9a6700" : "#cf222e";
                        const size = 16;
                        const stroke = 2.5;
                        const r = (size - stroke) / 2;
                        const circ = 2 * Math.PI * r;
                        const offset = circ * (1 - pct);
                        return (
                          <span
                            className="rate-limit-indicator"
                            title={`GitHub API: ${rateLimit.remaining}/${rateLimit.limit} remaining\nResets ${new Date(rateLimit.resetAt).toLocaleTimeString()}`}
                          >
                            <svg width={size} height={size} className="rate-limit-ring">
                              <circle
                                cx={size / 2}
                                cy={size / 2}
                                r={r}
                                fill="none"
                                stroke="var(--bs-border-color)"
                                strokeWidth={stroke}
                              />
                              <circle
                                cx={size / 2}
                                cy={size / 2}
                                r={r}
                                fill="none"
                                stroke={color}
                                strokeWidth={stroke}
                                strokeDasharray={circ}
                                strokeDashoffset={offset}
                                strokeLinecap="round"
                                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                              />
                            </svg>
                          </span>
                        );
                      })()}
                  </div>
                  <div className="content-header-actions">
                    <button
                      className={`sidebar-action-btn${refreshing ? " spinning" : ""}`}
                      onClick={async () => {
                        if (refreshing) return;
                        setRefreshing(true);
                        setToast("Clearing cache and refreshing...");
                        try {
                          apiCache.clear();
                          await apiClient.post("/cache/purge");
                          await Promise.all([
                            refresh(),
                            refreshNotes(),
                            refreshActivity(),
                            refreshPeerActivity(),
                          ]);
                          setToast("Refreshed successfully");
                        } catch {
                          setToast("Refresh failed — check connection");
                        } finally {
                          setRefreshing(false);
                          setTimeout(() => setToast(null), 3000);
                        }
                      }}
                      disabled={refreshing}
                      title="Clear cache and refresh all data"
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
                {toast && (
                  <div className="app-toast">
                    {refreshing && <Spinner animation="border" size="sm" />}
                    {toast}
                  </div>
                )}
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
                  {effectiveTab === "leaderboard" && (
                    <OrgLeaderboard active={effectiveTab === "leaderboard"} />
                  )}
                  {effectiveTab === "velocity" && (
                    <JiraVelocity active={effectiveTab === "velocity"} />
                  )}
                  {effectiveTab === "activity" && (
                    <Activity activities={activities} loading={activityLoading} />
                  )}
                  {effectiveTab === "peers" && <PeerActivity active={effectiveTab === "peers"} />}
                  {effectiveTab === "jira-activity" && (
                    <JiraActivity activities={activities} loading={activityLoading} />
                  )}
                </div>
              </>
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
