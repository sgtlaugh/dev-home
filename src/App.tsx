import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { apiClient, AppSettings, loadSettingsFromStore } from "./services/config";
import {
  IconRefresh,
  IconSettings,
  IconApps,
  IconNote,
  IconSubtask,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconCalendarStats,
  IconHistory,
  IconChartBar,
  IconUsers,
  IconTrophy,
  IconBrandGithub,
  IconBrandJira,
  IconChevronDown,
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
import { getRandomQuote } from "./constants/quotes";
import { Tooltip } from "./components/Tooltip";
import { useSystemStats } from "./hooks/useSystemStats";

function useRateLimitColor(
  rateLimit: { remaining: number; limit: number; resetAt: string } | null,
) {
  const pct = rateLimit ? rateLimit.remaining / rateLimit.limit : 0;
  const color = !rateLimit ? undefined : pct > 0.5 ? "#3fb950" : pct > 0.2 ? "#d29922" : "#f85149";
  const statusLabel = !rateLimit
    ? "Unknown"
    : pct > 0.5
      ? "Healthy"
      : pct > 0.2
        ? "Moderate"
        : "Critical";
  const resetTime = rateLimit ? new Date(rateLimit.resetAt) : null;
  const minsUntilReset = resetTime
    ? Math.max(0, Math.round((resetTime.getTime() - Date.now()) / 60000))
    : 0;
  return { pct, color, statusLabel, minsUntilReset };
}

export default function App() {
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem("settings:startupTab") || "summary",
  );
  const quote = useMemo(() => getRandomQuote(), []);
  const [currentMonthPRsCount, setCurrentMonthPRsCount] = useState(0);
  const {
    configured,
    loading: configLoading,
    backendOnline,
    jiraBaseUrl,
    githubUsername,
    saveSettings,
  } = useConfig();
  const [toast, setToast] = useState<string | null>(null);
  const [fetchTime, setFetchTime] = useState<{ label: string; ms: number } | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const fetchTimeCache = useRef<Record<string, number>>({});
  const tabLabelMap: Record<string, string> = {
    summary: "Dashboard",
    activity: "Activity",
    "jira-activity": "Activity",
    contributions: "Contributions",
    leaderboard: "Leaderboard",
    velocity: "Velocity",
    peers: "Team Activity",
  };
  const labelTabsMap: Record<string, string[]> = {};
  for (const [tab, label] of Object.entries(tabLabelMap)) {
    (labelTabsMap[label] ??= []).push(tab);
  }
  const showFetchTime = useCallback((label: string, ms: number) => {
    if (ms < 0) {
      delete fetchTimeCache.current[label];
      const tabs = labelTabsMap[label];
      if (tabs && tabs.includes(activeTabRef.current)) setFetchTime(null);
      return;
    }
    fetchTimeCache.current[label] = ms;
    const tabs = labelTabsMap[label];
    if (tabs && !tabs.includes(activeTabRef.current)) return;
    setFetchTime({ label, ms });
  }, []);
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
  } = useDashboard(configured, showFetchTime);
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
  useLayoutEffect(() => {
    const label = tabLabelMap[activeTab];
    const cached = label ? fetchTimeCache.current[label] : undefined;
    if (cached !== undefined) {
      setFetchTime({ label, ms: cached });
    } else if (label) {
      setFetchTime(null);
    } else {
      const tabNames: Record<string, string> = {
        jira: "Issues",
        mentions: "Notifications",
        prs: "Pull Requests",
        reviews: "Reviews",
        notes: "Notes",
        settings: "Settings",
        peers: "Peers",
      };
      setFetchTime({ label: tabNames[activeTab] || activeTab, ms: 0 });
    }
  }, [activeTab]);

  const jiraIssueCount = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return jiraIssues.filter((i) => new Date(i.updated) >= cutoff).length;
  }, [jiraIssues]);

  const isActivityTab = activeTab === "activity" || activeTab === "jira-activity";
  const {
    activities,
    loading: activityLoading,
    refresh: refreshActivity,
  } = useActivity(configured && isActivityTab, showFetchTime);
  const activityCounts = useActivityCount(configured);
  const systemStats = useSystemStats(configured);
  const { activities: teamActivities, refresh: refreshTeamActivity } = useTeamActivity(
    configured,
    showFetchTime,
  );
  const { rateLimit } = useGitHubRateLimit(configured);
  const prefetch = usePrefetchStatus(configured);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openNote, setOpenNote] = useState<import("./types").Note | null>(null);
  const [githubExpanded, setGithubExpanded] = useState(true);
  const [jiraExpanded, setJiraExpanded] = useState(true);
  const refreshBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "r" && refreshing === false) {
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement?.tagName !== "INPUT" && activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault();
          refreshBtnRef.current?.click();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [refreshing]);

  const EMPTY_SETTINGS: AppSettings = {
    jiraBaseUrl: "",
    jiraEmail: "",
    jiraApiToken: "",
    githubToken: "",
    githubUsername: "",
  };
  const [settingsForm, setSettingsForm] = useState<AppSettings>(EMPTY_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    loadSettingsFromStore()
      .then((s) => {
        if (s) setSettingsForm(s);
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = useCallback(async () => {
    setSettingsSaving(true);
    try {
      apiCache.clear();
      localStorage.clear();
      await apiClient.post("/cache/purge");
      await saveSettings(settingsForm);
      setToast("Settings saved");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to save settings");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSettingsSaving(false);
    }
  }, [settingsForm, saveSettings]);

  const githubTabs = ["activity", "contributions", "leaderboard", "prs", "reviews", "peers"];
  const jiraTabs = ["jira-activity", "jira", "mentions", "velocity"];

  // If config is not yet loaded, show settings first
  const effectiveTab = !configured && !configLoading ? "settings" : activeTab;

  return (
    <>
      <FindInPage />

      <ErrorBoundary>
        {/* Custom title bar */}
        <div className="custom-titlebar">
          <div className="titlebar-left">
            <img src="/devhome-logo-small.svg" alt="Dev Home" className="titlebar-icon" />
            <span className="titlebar-title">Dev Home</span>
          </div>
          <div className="titlebar-drag" />
          <div className="titlebar-controls">
            <Tooltip text="Minimize">
              <button className="titlebar-btn" onClick={() => window.electronAPI?.windowMinimize()}>
                <svg width="12" height="1">
                  <rect width="12" height="1" fill="currentColor" />
                </svg>
              </button>
            </Tooltip>
            <Tooltip text="Maximize">
              <button className="titlebar-btn" onClick={() => window.electronAPI?.windowMaximize()}>
                <svg width="12" height="12">
                  <rect
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </button>
            </Tooltip>
            <Tooltip text="Close">
              <button
                className="titlebar-btn titlebar-btn-close"
                onClick={() => window.electronAPI?.windowClose()}
              >
                <svg width="12" height="12">
                  <line x1="0" y1="0" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="12" y1="0" x2="0" y2="12" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="app-body">
          {/* Sidebar navigation */}
          <nav className="sidebar">
            <div className="sidebar-header" />

            {/* Overview */}
            <button
              className={`sidebar-top-item${effectiveTab === "summary" ? " active" : ""}`}
              onClick={() => setActiveTab("summary")}
            >
              <IconApps size={22} />
              <span className="sidebar-top-label">Overview</span>
            </button>

            <div className="sidebar-divider" />

            {/* GitHub section */}
            {(() => {
              const rl = useRateLimitColor(rateLimit);
              const btnRef = useRef<HTMLButtonElement>(null);
              const [rlHovered, setRlHovered] = useState(false);
              const [popoverPos, setPopoverPos] = useState<React.CSSProperties>({});
              const handleEnter = () => {
                if (btnRef.current) {
                  const rect = btnRef.current.getBoundingClientRect();
                  setPopoverPos({ position: "fixed", top: rect.top, left: rect.right + 8 });
                }
                setRlHovered(true);
              };
              return (
                <button
                  ref={btnRef}
                  className={`sidebar-top-item${githubExpanded ? " expanded" : ""}${githubTabs.includes(effectiveTab) ? " section-active" : ""}`}
                  onClick={() => setGithubExpanded(!githubExpanded)}
                  onMouseEnter={handleEnter}
                  onMouseLeave={() => setRlHovered(false)}
                >
                  <IconBrandGithub size={22} style={rl.color ? { color: rl.color } : undefined} />
                  <span className="sidebar-top-label">GitHub</span>
                  <span className="sidebar-chevron">
                    <IconChevronDown size={10} />
                  </span>
                  {rlHovered && rateLimit && (
                    <div className="rate-limit-popover popover-fixed" style={popoverPos}>
                      <div className="rlp-header">
                        <IconBrandGithub size={14} />
                        <span>GitHub API</span>
                        <span className="rlp-status" style={{ color: rl.color }}>
                          {rl.statusLabel}
                        </span>
                      </div>
                      <div className="rlp-bar-track">
                        <div
                          className="rlp-bar-fill"
                          style={{ width: `${rl.pct * 100}%`, backgroundColor: rl.color }}
                        />
                      </div>
                      <div className="rlp-details">
                        <span>
                          {`${rateLimit.remaining.toLocaleString()} / ${rateLimit.limit.toLocaleString()}`}
                        </span>
                        <span>{`Resets in ${rl.minsUntilReset}m`}</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })()}

            {githubExpanded && (
              <div className="sidebar-sub-items">
                {(
                  [
                    {
                      key: "activity",
                      label: "Activity",
                      icon: IconHistory,
                      count: activityCounts.github,
                    },
                    { key: "contributions", label: "Contributions", icon: IconCalendarStats },
                    { key: "leaderboard", label: "Leaderboard", icon: IconTrophy },
                    {
                      key: "prs",
                      label: "Pull Requests",
                      icon: IconGitPullRequest,
                      count: openPRs.length,
                    },
                    {
                      key: "reviews",
                      label: "Reviews",
                      icon: IconEye,
                      count: reviewRequests.length,
                    },
                    {
                      key: "peers",
                      label: "Team Activity",
                      icon: IconUsers,
                      count: teamActivities.length,
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    className={`sidebar-sub-item${effectiveTab === item.key ? " active" : ""}`}
                    onClick={() => setActiveTab(item.key)}
                  >
                    <item.icon size={15} />
                    <span>{item.label}</span>
                    {"count" in item && item.count > 0 ? (
                      <span className="sidebar-count-badge">{item.count}</span>
                    ) : !("count" in item) ? (
                      <span className="sidebar-chevron-hint">›</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            <div className="sidebar-divider" />

            {/* JIRA section */}
            <button
              className={`sidebar-top-item${jiraExpanded ? " expanded" : ""}${jiraTabs.includes(effectiveTab) ? " section-active" : ""}`}
              onClick={() => setJiraExpanded(!jiraExpanded)}
            >
              <IconBrandJira size={22} />
              <span className="sidebar-top-label">JIRA</span>
              <span className="sidebar-chevron">
                <IconChevronDown size={10} />
              </span>
            </button>

            {jiraExpanded && (
              <div className="sidebar-sub-items">
                {(
                  [
                    {
                      key: "jira-activity",
                      label: "Activity",
                      icon: IconHistory,
                      count: activityCounts.jira,
                    },
                    { key: "jira", label: "Issues", icon: IconSubtask, count: jiraIssueCount },
                    {
                      key: "mentions",
                      label: "Notifications",
                      icon: IconAt,
                      count: jiraComments.length,
                    },
                    { key: "velocity", label: "Velocity", icon: IconChartBar },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    className={`sidebar-sub-item${effectiveTab === item.key ? " active" : ""}`}
                    onClick={() => setActiveTab(item.key)}
                  >
                    <item.icon size={15} />
                    <span>{item.label}</span>
                    {"count" in item && item.count > 0 ? (
                      <span className="sidebar-count-badge">{item.count}</span>
                    ) : !("count" in item) ? (
                      <span className="sidebar-chevron-hint">›</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            <div className="sidebar-divider" />

            {/* Notes */}
            <button
              className={`sidebar-top-item${effectiveTab === "notes" ? " active" : ""}`}
              onClick={() => setActiveTab("notes")}
            >
              <IconNote size={22} />
              <span className="sidebar-top-label">Notes</span>
              {unresolvedNotes.length > 0 && (
                <span className="sidebar-count-badge">{unresolvedNotes.length}</span>
              )}
            </button>

            <div className="sidebar-divider" />

            {/* Settings */}
            <button
              className={`sidebar-top-item${effectiveTab === "settings" ? " active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <IconSettings size={22} />
              <span className="sidebar-top-label">Settings</span>
            </button>

            <div style={{ flex: 1 }} />
          </nav>

          {/* Main content panel */}
          <main className="main-content">
            {/* Error alert */}
            {error && (
              <Alert variant="danger" className="small" dismissible>
                {error}
              </Alert>
            )}

            <div className="content-header">
              <div className="content-header-time">
                {effectiveTab === "summary" && (
                  <>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontStyle: "italic",
                        color: "#656d76",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        letterSpacing: "0.01em",
                        paddingRight: "2px",
                      }}
                    >
                      {quote}
                    </span>
                  </>
                )}
                {(prefetch.running || prefetch.complete) &&
                  effectiveTab === "leaderboard" &&
                  (() => {
                    const done = prefetch.complete;
                    if (done) {
                      return (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: "#0969da",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ✓ Org caching done
                        </span>
                      );
                    }
                    const pct = prefetch.percentage / 100;
                    const color = "#0969da";
                    const size = 14;
                    const stroke = 2.5;
                    const r = (size - stroke) / 2;
                    const circ = 2 * Math.PI * r;
                    const offset = circ * (1 - pct);
                    return (
                      <span className="rate-limit-widget">
                        <svg width={size} height={size} className="rate-limit-ring">
                          <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={r}
                            fill="none"
                            stroke="#e1e4e8"
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
                        <div className="rate-limit-popover popover-left">
                          <div className="rlp-header">
                            <IconBrandGithub size={14} />
                            <span>Org Caching</span>
                            <span className="rlp-status" style={{ color }}>
                              {prefetch.org || "org"}
                            </span>
                          </div>
                          <div className="rlp-bar-track">
                            <div
                              className="rlp-bar-fill"
                              style={{ width: `${pct * 100}%`, backgroundColor: color }}
                            />
                          </div>
                          <div className="rlp-details">
                            <span>
                              {prefetch.monthsDone} / {prefetch.totalMonths} months
                            </span>
                            <span>{Math.round(pct * 100)}%</span>
                          </div>
                        </div>
                      </span>
                    );
                  })()}
              </div>
              <div className="content-header-actions">
                {fetchTime ? (
                  <Tooltip text={`${fetchTime.label} fetch time`}>
                    <span
                      style={{
                        color: "#1a7f37",
                        fontSize: "0.7rem",
                        fontWeight: 500,
                        padding: "0 6px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {fetchTime.ms.toLocaleString()} ms
                    </span>
                  </Tooltip>
                ) : (
                  tabLabelMap[effectiveTab] && (
                    <span style={{ padding: "0 6px", display: "flex", alignItems: "center" }}>
                      <Spinner
                        animation="border"
                        style={{ width: 10, height: 10, borderWidth: 1.5, color: "#1a7f37" }}
                      />
                    </span>
                  )
                )}
                <Tooltip
                  text={
                    lastRefreshTime
                      ? `Last refresh: ${Math.round((Date.now() - lastRefreshTime) / 60000)}m ago (Alt+R)`
                      : "Clear cache and refresh all data (Alt+R)"
                  }
                >
                  <button
                    ref={refreshBtnRef}
                    className={`header-refresh-btn${refreshing ? " spinning" : ""}`}
                    onClick={async () => {
                      if (refreshing) return;
                      setRefreshing(true);
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
                      } catch {
                        setToast("Refresh failed — check connection");
                        setTimeout(() => setToast(null), 3000);
                      } finally {
                        setRefreshing(false);
                      }
                    }}
                    disabled={refreshing}
                  >
                    <IconRefresh size={16} />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Show settings or dashboard */}
            {effectiveTab === "settings" ? (
              <div className="tab-content-area">
                <SettingsView
                  backendOnline={backendOnline}
                  configured={configured}
                  jiraBaseUrl={jiraBaseUrl}
                  githubUsername={githubUsername}
                  formState={settingsForm}
                  setFormState={setSettingsForm}
                  setToast={setToast}
                  saving={settingsSaving}
                  onSave={handleSaveSettings}
                />
              </div>
            ) : (
              <>
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
                      systemStats={systemStats}
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
                      active={effectiveTab === "notes"}
                    />
                  )}
                  {effectiveTab === "contributions" && (
                    <Contributions
                      onCountChange={setCurrentMonthPRsCount}
                      active={effectiveTab === "contributions"}
                      onFetchComplete={showFetchTime}
                    />
                  )}
                  {effectiveTab === "leaderboard" && (
                    <OrgLeaderboard
                      active={effectiveTab === "leaderboard"}
                      githubUsername={githubUsername}
                      onFetchComplete={showFetchTime}
                    />
                  )}
                  {effectiveTab === "velocity" && (
                    <JiraVelocity
                      active={effectiveTab === "velocity"}
                      onFetchComplete={showFetchTime}
                    />
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
