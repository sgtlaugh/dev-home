import { useState } from "react";
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
import { Contributions } from "./components/Contributions";
import { Activity } from "./components/Activity";
import { JiraActivity } from "./components/JiraActivity";
import { JiraVelocity } from "./components/JiraVelocity";
import { TeamActivity } from "./components/TeamActivity";
import { OrgLeaderboard } from "./components/OrgLeaderboard";
import { useActivity } from "./hooks/useActivity";
import { useActivityCount } from "./hooks/useActivityCount";
import { useTeamActivity } from "./hooks/useTeamActivity";
import { useGitHubRateLimit } from "./hooks/useGitHubRateLimit";
import { usePrefetchStatus } from "./hooks/useOrgLeaderboard";
import { apiCache } from "./utils/cache";

export default function App() {
  const [activeTab, setActiveTab] = useState("summary");
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
  const isActivityTab = activeTab === "activity" || activeTab === "jira-activity";
  const {
    activities,
    loading: activityLoading,
    refresh: refreshActivity,
  } = useActivity(configured && isActivityTab);
  const activityCounts = useActivityCount(configured);
  const { activities: teamActivities, refresh: refreshTeamActivity } = useTeamActivity(configured);
  const { rateLimit } = useGitHubRateLimit(configured);
  const prefetch = usePrefetchStatus(configured);
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
          <nav className="sidebar">
            <div className="sidebar-header" />
            {[
              { key: "summary", label: "Overview", icon: IconLayoutDashboard },
              { group: "separator" },
              { group: "label", label: "GitHub" },
              { key: "activity", label: "Activity", icon: IconHistory },
              { key: "contributions", label: "Contributions", icon: IconCalendarStats },
              { key: "leaderboard", label: "Leaderboard", icon: IconTrophy },
              { key: "prs", label: "Pull Requests", icon: IconGitPullRequest },
              { key: "reviews", label: "Review Requests", icon: IconEye },
              { key: "peers", label: "Team Activity", icon: IconUsers },
              { group: "separator" },
              { group: "label", label: "JIRA" },
              { key: "jira-activity", label: "Activity", icon: IconHistory },
              { key: "jira", label: "Issues", icon: IconSubtask },
              { key: "mentions", label: "Notifications", icon: IconAt },
              { key: "velocity", label: "Velocity", icon: IconChartBar },
              { group: "separator" },
              { key: "notes", label: "Notes", icon: IconNotes },
            ].map((item, idx) => {
              if (item.group === "separator") {
                return <div key={`sep-${idx}`} className="sidebar-separator" />;
              }
              if (item.group === "label") {
                const size = 12;
                const stroke = 2;
                const r = (size - stroke) / 2;
                return (
                  <div
                    key={item.label}
                    className={`sidebar-group-label ${item.label?.toLowerCase()}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      lineHeight: 1,
                      paddingLeft: "14px",
                    }}
                  >
                    {item.label === "GitHub" &&
                      (() => {
                        if (!rateLimit) {
                          return (
                            <span style={{ display: "flex", alignItems: "center" }}>
                              <svg width={size} height={size} className="rate-limit-ring">
                                <circle
                                  cx={size / 2}
                                  cy={size / 2}
                                  r={r}
                                  fill="none"
                                  stroke="rgba(255,255,255,0.15)"
                                  strokeWidth={stroke}
                                />
                              </svg>
                            </span>
                          );
                        }
                        const pct = rateLimit.remaining / rateLimit.limit;
                        const color = pct > 0.5 ? "#3fb950" : pct > 0.2 ? "#d29922" : "#f85149";
                        const circ = 2 * Math.PI * r;
                        const offset = circ * (1 - pct);
                        return (
                          <span
                            className="rate-limit-indicator"
                            title={`GitHub API: ${rateLimit.remaining}/${rateLimit.limit} remaining\nResets ${new Date(rateLimit.resetAt).toLocaleTimeString()}`}
                            style={{ display: "flex", alignItems: "center" }}
                          >
                            <svg width={size} height={size} className="rate-limit-ring">
                              <circle
                                cx={size / 2}
                                cy={size / 2}
                                r={r}
                                fill="none"
                                stroke="rgba(255,255,255,0.15)"
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
                    {item.label === "JIRA" && (
                      <span style={{ display: "flex", alignItems: "center" }}>
                        <svg width={size} height={size} className="rate-limit-ring">
                          <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={r}
                            fill="none"
                            stroke="rgba(255,255,255,0.15)"
                            strokeWidth={stroke}
                          />
                          <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={r}
                            fill="none"
                            stroke="#58a6ff"
                            strokeWidth={stroke}
                          />
                        </svg>
                      </span>
                    )}
                    {item.label}
                  </div>
                );
              }

              if (!item.icon) return null;

              const count = item.key === "notes" ? unresolvedNotes.length : undefined;

              return (
                <button
                  key={item.key}
                  className={`sidebar-tab${effectiveTab === item.key ? " active" : ""}`}
                  onClick={() => setActiveTab(item.key!)}
                  title={item.label}
                >
                  <item.icon size={16} className="sidebar-icon" />
                  <span className="sidebar-tab-label">
                    {item.label}
                    {count !== undefined && count > 0 && (
                      <span className="sidebar-count-sup">{count}</span>
                    )}
                  </span>
                </button>
              );
            })}
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
                    {(prefetch.running || prefetch.complete) &&
                      effectiveTab === "leaderboard" &&
                      (() => {
                        const done = prefetch.complete;
                        if (done) {
                          return (
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: "#1a7f37",
                                whiteSpace: "nowrap",
                              }}
                            >
                              ✓ Org caching done
                            </span>
                          );
                        }
                        const pct = prefetch.percentage / 100;
                        const color = "#0969da";
                        const size = 16;
                        const stroke = 2.5;
                        const r = (size - stroke) / 2;
                        const circ = 2 * Math.PI * r;
                        const offset = circ * (1 - pct);
                        const tip = `Caching ${prefetch.org}... ${prefetch.percentage}% (${prefetch.monthsDone}/${prefetch.totalMonths} months)`;
                        return (
                          <span className="rate-limit-indicator" title={tip}>
                            <svg width={size} height={size} className="rate-limit-ring">
                              <circle
                                cx={size / 2}
                                cy={size / 2}
                                r={r}
                                fill="none"
                                stroke="rgba(255,255,255,0.15)"
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
                    {loading && <Spinner animation="border" size="sm" variant="secondary" />}
                    {!loading && lastRefreshTime && (
                      <span
                        className="text-secondary sidebar-refresh-time sidebar-action-btn"
                        title={`Last refresh: ${new Date(lastRefreshTime).toLocaleString()}`}
                        style={{
                          cursor: "default",
                          padding: "0 8px",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {Math.round((Date.now() - lastRefreshTime) / 60000)}m
                      </span>
                    )}
                    <button
                      className={`sidebar-action-btn${refreshing ? " spinning" : ""}`}
                      onClick={async () => {
                        if (refreshing) return;
                        setRefreshing(true);
                        setToast("Clearing cache and refreshing...");
                        try {
                          apiCache.clear();
                          localStorage.clear();
                          await apiClient.post("/cache/purge");
                          await Promise.all([
                            refresh(),
                            refreshNotes(),
                            refreshActivity(),
                            refreshTeamActivity(),
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
                <div className="tab-content-area">
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
                  {effectiveTab === "contributions" && (
                    <Contributions
                      onCountChange={setCurrentMonthPRsCount}
                      active={effectiveTab === "contributions"}
                    />
                  )}
                  {effectiveTab === "leaderboard" && (
                    <OrgLeaderboard
                      active={effectiveTab === "leaderboard"}
                      githubUsername={githubUsername}
                    />
                  )}
                  {effectiveTab === "velocity" && (
                    <JiraVelocity active={effectiveTab === "velocity"} />
                  )}
                  {effectiveTab === "activity" && (
                    <Activity activities={activities} loading={activityLoading} />
                  )}
                  {effectiveTab === "peers" && <TeamActivity active={effectiveTab === "peers"} />}
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
