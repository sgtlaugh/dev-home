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
} from "@tabler/icons-react";
import { AppSettings, apiClient } from "../services/config";
import { useUserOrgs, usePrefetchStatus } from "../hooks/useOrgLeaderboard";

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
  apiCache: number;
  contributions: number;
  profiles: number;
}

const ACCENTS = {
  github: "#1a7f37",
  jira: "#0969da",
  preferences: "#57606a",
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
      await apiClient.post("/cache/purge");
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
  const cacheTotal = cacheStats
    ? cacheStats.apiCache + cacheStats.contributions + cacheStats.profiles
    : 0;

  return (
    <div>
      <Row>
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
              <Form.Text className="text-secondary-custom" style={{ fontSize: "0.7rem" }}>
                Tab shown when the app launches.
              </Form.Text>
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
              <Button
                variant="outline-danger"
                size="sm"
                onClick={handleClearCache}
                className="d-flex align-items-center gap-1"
                style={{ fontSize: "0.7rem", padding: "2px 8px" }}
              >
                <IconTrash size={12} />
                Clear
              </Button>
            }
          >
            {cacheStats && (
              <div style={{ fontSize: "0.8rem" }}>
                {cacheTotal > 0 && (
                  <div className="settings-cache-bar mb-2">
                    <div
                      className="settings-cache-segment"
                      style={{
                        width: `${(cacheStats.apiCache / cacheTotal) * 100}%`,
                        backgroundColor: "#8250df",
                      }}
                    />
                    <div
                      className="settings-cache-segment"
                      style={{
                        width: `${(cacheStats.contributions / cacheTotal) * 100}%`,
                        backgroundColor: "#1a7f37",
                      }}
                    />
                    <div
                      className="settings-cache-segment"
                      style={{
                        width: `${(cacheStats.profiles / cacheTotal) * 100}%`,
                        backgroundColor: "#0969da",
                      }}
                    />
                  </div>
                )}
                <div
                  className="d-flex justify-content-between py-1"
                  style={{ borderBottom: "1px solid #d1d9e0" }}
                >
                  <span className="d-flex align-items-center gap-1">
                    <span className="settings-cache-dot" style={{ backgroundColor: "#8250df" }} />
                    <span className="text-secondary-custom">API cache</span>
                  </span>
                  <span>{cacheStats.apiCache}</span>
                </div>
                <div
                  className="d-flex justify-content-between py-1"
                  style={{ borderBottom: "1px solid #d1d9e0" }}
                >
                  <span className="d-flex align-items-center gap-1">
                    <span className="settings-cache-dot" style={{ backgroundColor: "#1a7f37" }} />
                    <span className="text-secondary-custom">Contributions</span>
                  </span>
                  <span>{cacheStats.contributions.toLocaleString()}</span>
                </div>
                <div className="d-flex justify-content-between py-1">
                  <span className="d-flex align-items-center gap-1">
                    <span className="settings-cache-dot" style={{ backgroundColor: "#0969da" }} />
                    <span className="text-secondary-custom">Profiles</span>
                  </span>
                  <span>{cacheStats.profiles}</span>
                </div>
              </div>
            )}

            {prefetch && (
              <div
                className="mt-3 pt-2"
                style={{ borderTop: "1px solid #d1d9e0", fontSize: "0.8rem" }}
              >
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-secondary-custom">Org caching</span>
                  <span
                    style={{ fontSize: "0.7rem", color: prefetch.complete ? "#1a7f37" : "#656d76" }}
                  >
                    {prefetch.complete
                      ? "Complete"
                      : prefetch.running
                        ? `${prefetch.org || "..."} — ${prefetch.percentage}%`
                        : "Idle"}
                  </span>
                </div>
                {prefetch.running && (
                  <div className="settings-cache-bar">
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
      <div className="d-flex justify-content-end mb-3 mt-2">
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

      {/* Footer */}
      <div className="settings-footer">
        <img src="/devhome-logo.svg" alt="Dev Home" width={12} height={12} />
        <span>dev-home v{__APP_VERSION__}</span>
        <span className="settings-footer-sep">·</span>
        <a
          href="https://github.com/sgtlaugh/dev-home"
          target="_blank"
          rel="noopener noreferrer"
          className="d-flex align-items-center gap-1"
        >
          <IconBrandGithub size={11} />
          View on GitHub
        </a>
      </div>
    </div>
  );
};
