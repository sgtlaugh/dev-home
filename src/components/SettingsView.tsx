import React, { useState, useEffect, useCallback } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import {
  IconBrandGithub,
  IconBrandJira,
  IconTrash,
  IconCopy,
  IconCheck,
  IconAdjustments,
  IconDatabase,
  IconBug,
  IconCircleCheck,
  IconCircleMinus,
} from "@tabler/icons-react";
import { AppSettings, apiClient } from "../services/config";
import { useUserOrgs, usePrefetchStatus } from "../hooks/useOrgLeaderboard";
import { Tooltip } from "./Tooltip";

declare const __APP_VERSION__: string;

interface SettingsViewProps {
  backendOnline: boolean;
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
  formState: AppSettings;
  setFormState: React.Dispatch<React.SetStateAction<AppSettings>>;
  setToast: (msg: string | null) => void;
  saving: boolean;
  onSave: () => void;
}

const STARTUP_TABS = [
  { value: "summary", label: "Overview" },
  { value: "activity", label: "Activity" },
  { value: "prs", label: "Pull Requests" },
  { value: "reviews", label: "Reviews" },
  { value: "jira", label: "JIRA Tasks" },
  { value: "notes", label: "Notes" },
];

interface CacheStats {
  activity: number;
  prs: number;
  orgLeaderboard: number;
  profiles: number;
  contributions: number;
}

const ACCENTS = {
  github: "#1a7f37",
  jira: "#0969da",
  preferences: "#e3795c",
  cache: "#8250df",
};

function maskToken(token: string): string {
  if (!token || token.length <= 4) return token ? "••••" : "";
  return "••••••••" + token.slice(-4);
}

function TokenField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  if (value && !editing) {
    return (
      <div className="settings-token-display">
        <span className="settings-token-masked">{maskToken(value)}</span>
        <span className="settings-token-actions">
          <button className="settings-token-btn" onClick={handleCopy} title="Copy">
            {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          </button>
          <button
            className="settings-token-btn settings-token-change"
            onClick={() => setEditing(true)}
          >
            Change
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="d-flex gap-2">
      <Form.Control
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size="sm"
        autoFocus={editing}
      />
      {editing && (
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() => setEditing(false)}
          style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  accent,
  status,
  headerAction,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  status?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      className="mb-3 summary-card h-100"
      style={{ borderLeft: `3px solid ${accent}`, minHeight: "auto" }}
    >
      <Card.Body>
        <div className="section-header mb-3" style={{ paddingBottom: 0 }}>
          <span
            className="section-icon-bg"
            style={{ backgroundColor: `${accent}15`, color: accent }}
          >
            {icon}
          </span>
          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{title}</span>
          {status}
          {headerAction && (
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
              {headerAction}
            </span>
          )}
        </div>
        {children}
      </Card.Body>
    </Card>
  );
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="d-flex align-items-center gap-1" style={{ marginLeft: 8 }}>
      <span className={`status-dot ${online ? "online" : "offline"}`} />
      <span style={{ fontSize: "0.7rem", color: online ? "#1a7f37" : "#656d76" }}>
        {online ? "Connected" : "Offline"}
      </span>
    </span>
  );
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  backendOnline,
  configured,
  jiraBaseUrl,
  githubUsername,
  formState,
  setFormState,
  setToast,
  saving,
  onSave,
}) => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const { orgs } = useUserOrgs(configured);
  const prefetch = usePrefetchStatus(configured);
  const [defaultOrg, setDefaultOrg] = useState(
    () => localStorage.getItem("leaderboard:defaultOrg") || "",
  );
  const [startupTab, setStartupTab] = useState(
    () => localStorage.getItem("settings:startupTab") || "summary",
  );
  const [githubEmail, setGithubEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!formState.githubToken) return;
    fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${formState.githubToken}` },
    })
      .then((r) => r.json())
      .then((emails) => {
        if (!Array.isArray(emails)) return;
        const primary = emails.find((e: { primary: boolean }) => e.primary);
        setGithubEmail(primary?.email || emails[0]?.email || null);
      })
      .catch(() => {});
  }, [formState.githubToken]);

  useEffect(() => {
    fetchCacheStats();
  }, []);

  const fetchCacheStats = async () => {
    try {
      const { data } = await apiClient.get<CacheStats>("/cache/stats");
      setCacheStats(data);
    } catch {
      /* ignore */
    }
  };

  const handleChange = (field: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleTokenChange = (field: keyof AppSettings) => (val: string) => {
    setFormState((prev) => ({ ...prev, [field]: val }));
  };

  const handleClearCache = async () => {
    try {
      const categories = cacheCategories.map((c) => c.key);
      await Promise.all(categories.map((k) => apiClient.delete(`/cache/${k}`)));
      fetchCacheStats();
      setToast("Cache cleared");
      setTimeout(() => setToast(null), 3000);
    } catch {
      /* ignore */
    }
  };

  const handleOrgChange = (val: string) => {
    setDefaultOrg(val);
    localStorage.setItem("leaderboard:defaultOrg", val);
  };

  const handleStartupTabChange = (val: string) => {
    setStartupTab(val);
    localStorage.setItem("settings:startupTab", val);
  };

  const labelStyle: React.CSSProperties = { fontSize: "0.8125rem" };

  const githubConnected = backendOnline && configured && !!githubUsername;
  const jiraConnected = backendOnline && configured && !!jiraBaseUrl;
  const cacheCategories: {
    key: keyof CacheStats;
    label: string;
    tooltip: string;
    color: string;
  }[] = [
    {
      key: "activity",
      label: "Activity history",
      tooltip: "30-day activity feed",
      color: "#e3795c",
    },
    { key: "prs", label: "Pull requests", tooltip: "All-time PR data", color: "#0969da" },
    {
      key: "orgLeaderboard",
      label: "Org leaderboard",
      tooltip: "Member stats by month",
      color: "#1a7f37",
    },
    { key: "profiles", label: "Profiles", tooltip: "Avatars and names", color: "#8250df" },
    {
      key: "contributions",
      label: "Contribution stats",
      tooltip: "Monthly commit/review counts",
      color: "#bf8700",
    },
  ];

  const handleClearCategory = async (category: string) => {
    try {
      await apiClient.delete(`/cache/${category}`);
      fetchCacheStats();
    } catch {
      setToast("Failed to clear cache");
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div>
      <Row style={{ marginBottom: "1.5rem" }}>
        {/* GitHub */}
        <Col lg={6}>
          <SectionCard
            icon={<IconBrandGithub size={13} stroke={1.8} />}
            title="GitHub"
            accent={ACCENTS.github}
            status={<StatusDot online={githubConnected} />}
          >
            {githubConnected && (
              <div className="settings-meta mb-3">
                <a
                  href={`https://github.com/${githubUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/{githubUsername}
                </a>
              </div>
            )}
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary-custom" style={labelStyle}>
                Username
              </Form.Label>
              <Form.Control
                type="text"
                placeholder="your-github-username"
                value={formState.githubUsername}
                onChange={handleChange("githubUsername")}
                size="sm"
              />
            </Form.Group>

            {githubEmail && (
              <Form.Group className="mb-3">
                <Form.Label className="text-secondary-custom" style={labelStyle}>
                  Email
                </Form.Label>
                <div className="settings-token-display">
                  <span className="settings-token-masked" style={{ letterSpacing: 0 }}>
                    {githubEmail}
                  </span>
                </div>
              </Form.Group>
            )}

            <Form.Group className="mb-0">
              <Form.Label className="text-secondary-custom" style={labelStyle}>
                Personal Access Token
              </Form.Label>
              <TokenField
                value={formState.githubToken}
                onChange={handleTokenChange("githubToken")}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              />
            </Form.Group>
          </SectionCard>
        </Col>

        {/* JIRA */}
        <Col lg={6}>
          <SectionCard
            icon={<IconBrandJira size={13} stroke={1.8} />}
            title="JIRA"
            accent={ACCENTS.jira}
            status={<StatusDot online={jiraConnected} />}
          >
            {jiraConnected && (
              <div className="settings-meta mb-3">
                <a href={jiraBaseUrl} target="_blank" rel="noopener noreferrer">
                  {jiraBaseUrl.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary-custom" style={labelStyle}>
                Base URL
              </Form.Label>
              <Form.Control
                type="text"
                placeholder="https://your-org.atlassian.net"
                value={formState.jiraBaseUrl}
                onChange={handleChange("jiraBaseUrl")}
                size="sm"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-secondary-custom" style={labelStyle}>
                Email
              </Form.Label>
              <Form.Control
                type="email"
                placeholder="you@company.com"
                value={formState.jiraEmail}
                onChange={handleChange("jiraEmail")}
                size="sm"
              />
            </Form.Group>

            <Form.Group className="mb-0">
              <Form.Label className="text-secondary-custom" style={labelStyle}>
                API Token
              </Form.Label>
              <TokenField
                value={formState.jiraApiToken}
                onChange={handleTokenChange("jiraApiToken")}
                placeholder="your-jira-api-token"
              />
            </Form.Group>
          </SectionCard>
        </Col>
      </Row>

      <Row>
        {/* Preferences */}
        <Col lg={6}>
          <SectionCard
            icon={<IconAdjustments size={13} stroke={1.8} />}
            title="Preferences"
            accent={ACCENTS.preferences}
          >
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary-custom" style={labelStyle}>
                Startup Tab
              </Form.Label>
              <Form.Select
                size="sm"
                value={startupTab}
                onChange={(e) => handleStartupTabChange(e.target.value)}
                className="date-dropdown"
              >
                {STARTUP_TABS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-0">
              <Form.Label className="text-secondary-custom" style={labelStyle}>
                Default Organization
              </Form.Label>
              {orgs.length > 0 ? (
                <>
                  <Form.Select
                    size="sm"
                    value={defaultOrg}
                    onChange={(e) => handleOrgChange(e.target.value)}
                    className="date-dropdown"
                  >
                    {orgs.map((o) => (
                      <option key={o.login} value={o.login}>
                        {o.login.charAt(0).toUpperCase() + o.login.slice(1)}
                      </option>
                    ))}
                  </Form.Select>
                </>
              ) : (
                <div className="text-secondary-custom" style={{ fontSize: "0.8rem" }}>
                  No organizations found.{" "}
                  <a
                    href="https://docs.github.com/en/organizations"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Learn about GitHub organizations
                  </a>
                </div>
              )}
            </Form.Group>
          </SectionCard>
        </Col>

        {/* Cache */}
        <Col lg={6}>
          <SectionCard
            icon={<IconDatabase size={13} stroke={1.8} />}
            title="Cache"
            accent={ACCENTS.cache}
            headerAction={
              <button className="settings-cache-clear-all-btn" onClick={handleClearCache}>
                Clear all
                <IconTrash size={11} />
              </button>
            }
          >
            {cacheStats && (
              <div style={{ fontSize: "0.8rem" }}>
                {cacheCategories.map(({ key, label, tooltip, color }) => (
                  <div key={key} className="settings-cache-row">
                    <span className="settings-cache-dot" style={{ backgroundColor: color }} />
                    <span style={{ flex: 1 }}>
                      <Tooltip text={tooltip}>
                        <span className="text-secondary-custom" style={{ cursor: "help" }}>
                          {label}
                        </span>
                      </Tooltip>
                    </span>
                    <span>{cacheStats[key].toLocaleString()}</span>
                    <button
                      className="settings-cache-clear-btn"
                      onClick={() => handleClearCategory(key)}
                      title={`Clear ${label.toLowerCase()}`}
                    >
                      <IconTrash size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {prefetch && (
              <div
                className="mt-2 pt-2"
                style={{ borderTop: "1px solid #d1d9e0", fontSize: "0.8rem" }}
              >
                <div className="settings-cache-row">
                  <span className="settings-cache-dot" style={{ backgroundColor: "#0969da" }} />
                  <span className="text-secondary-custom" style={{ flex: 1 }}>
                    Org caching
                  </span>
                  {prefetch.running ? (
                    <span style={{ fontSize: "0.8rem", color: "#656d76" }}>
                      {prefetch.org || "..."} {prefetch.percentage}%
                    </span>
                  ) : (
                    <Tooltip text={prefetch.complete ? "Complete" : "Idle"}>
                      <span style={{ marginRight: 24 }}>
                        {prefetch.complete ? (
                          <IconCircleCheck size={14} stroke={1.8} color="#1a7f37" />
                        ) : (
                          <IconCircleMinus size={14} stroke={1.8} color="#656d76" />
                        )}
                      </span>
                    </Tooltip>
                  )}
                </div>
                {prefetch.running && (
                  <div className="settings-cache-bar" style={{ marginLeft: 22 }}>
                    <div
                      className="settings-cache-segment"
                      style={{
                        width: `${prefetch.percentage}%`,
                        backgroundColor: "#0969da",
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </Col>
      </Row>

      {/* Save */}
      <div className="d-flex justify-content-center mb-3 mt-4">
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="d-flex align-items-center gap-2"
          style={{ padding: "6px 24px" }}
        >
          {saving ? (
            <>
              <Spinner
                animation="border"
                size="sm"
                style={{ width: 12, height: 12, borderWidth: "1.5px" }}
              />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>

      {/* About */}
      <div className="settings-footer">
        <img
          src="/devhome-logo.svg"
          alt=""
          width={18}
          height={18}
          className="settings-footer-logo"
        />
        <span className="settings-footer-name">Dev Home</span>
        <span className="settings-about-version">v{__APP_VERSION__}</span>
        <span className="settings-footer-sep">·</span>
        <a href="https://github.com/sgtlaugh/dev-home" target="_blank" rel="noopener noreferrer">
          <IconBrandGithub size={13} /> GitHub
        </a>
        <span className="settings-footer-sep">·</span>
        <a
          href="https://github.com/sgtlaugh/dev-home/issues/new"
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconBug size={13} /> Report Issue
        </a>
      </div>
    </div>
  );
};
