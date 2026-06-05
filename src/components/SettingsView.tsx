import React, { useState, useEffect } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { IconArrowLeft, IconTrash, IconBrandGithub, IconBrandJira } from "@tabler/icons-react";
import { AppSettings, loadSettingsFromStore, apiClient } from "../services/config";
import { useUserOrgs } from "../hooks/useOrgLeaderboard";

declare const __APP_VERSION__: string;

interface SettingsViewProps {
  backendOnline: boolean;
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
  onBack: () => void;
  saveSettings: (settings: AppSettings) => Promise<void>;
}

const EMPTY_SETTINGS: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  githubToken: "",
  githubUsername: "",
};

interface CacheStats {
  apiCache: number;
  contributions: number;
  profiles: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  backendOnline,
  configured,
  jiraBaseUrl,
  githubUsername,
  onBack,
  saveSettings,
}) => {
  const [formState, setFormState] = useState<AppSettings>(EMPTY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const { orgs } = useUserOrgs(configured);
  const [defaultOrg, setDefaultOrg] = useState(
    () => localStorage.getItem("leaderboard:defaultOrg") || "",
  );

  useEffect(() => {
    async function loadSettings() {
      try {
        const stored = await loadSettingsFromStore();
        if (stored) setFormState(stored);
      } catch (err) {
        console.error("Failed to load settings from store:", err);
      }
    }
    loadSettings();
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

  const handleSave = async () => {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      localStorage.setItem("leaderboard:defaultOrg", defaultOrg);
      await saveSettings(formState);
      setSuccessMessage("Settings saved successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    try {
      await apiClient.post("/cache/purge");
      fetchCacheStats();
      setSuccessMessage("Cache cleared.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      /* ignore */
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: "0.8125rem" };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-3">
          <Button
            variant="outline-secondary"
            size="sm"
            className="d-flex align-items-center gap-2"
            onClick={onBack}
          >
            <IconArrowLeft size={14} />
            Back
          </Button>
          <div>
            <h5 className="mb-0">Settings</h5>
            <p className="text-secondary-custom mb-0" style={{ fontSize: "0.8125rem" }}>
              Configure your integrations and preferences.
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>

      <Card className="mb-3" style={{ minHeight: "auto" }}>
        <Card.Body className="py-2 px-3">
          <div className="d-flex align-items-center gap-2">
            <span className={`status-dot ${backendOnline ? "online" : "offline"}`} />
            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              {backendOnline ? "Connected" : "Offline"}
            </span>
            {backendOnline && configured && (
              <span
                className="d-flex align-items-center gap-2"
                style={{ fontSize: "0.75rem", marginLeft: "auto" }}
              >
                <a
                  href={jiraBaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="d-flex align-items-center gap-1"
                >
                  <IconBrandJira size={12} />
                  {jiraBaseUrl}
                </a>
                <span className="text-secondary-custom">·</span>
                <a
                  href={`https://github.com/${githubUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="d-flex align-items-center gap-1"
                >
                  <IconBrandGithub size={12} />
                  {githubUsername}
                </a>
              </span>
            )}
            {!backendOnline && (
              <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                Run: <code>cd server && yarn dev</code>
              </span>
            )}
            {backendOnline && !configured && (
              <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                Fill in credentials below and save.
              </span>
            )}
          </div>
        </Card.Body>
      </Card>

      {successMessage && (
        <Alert
          variant="success"
          className="py-2"
          dismissible
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert variant="danger" className="py-2" dismissible onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <Row>
        <Col lg={6}>
          <Card className="mb-3" style={{ minHeight: "auto" }}>
            <Card.Body>
              <h6 style={{ marginBottom: 12 }}>GitHub</h6>

              <Form.Group className="mb-3">
                <Form.Label className="text-secondary-custom" style={labelStyle}>
                  Token
                </Form.Label>
                <Form.Control
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={formState.githubToken}
                  onChange={handleChange("githubToken")}
                  size="sm"
                />
              </Form.Group>

              <Form.Group className="mb-0">
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
            </Card.Body>
          </Card>
        </Col>

        <Col lg={6}>
          <Card className="mb-3" style={{ minHeight: "auto" }}>
            <Card.Body>
              <h6 style={{ marginBottom: 12 }}>JIRA</h6>

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
                <Form.Control
                  type="password"
                  placeholder="your-jira-api-token"
                  value={formState.jiraApiToken}
                  onChange={handleChange("jiraApiToken")}
                  size="sm"
                />
              </Form.Group>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col lg={6}>
          <Card className="mb-3" style={{ minHeight: "auto" }}>
            <Card.Body>
              <h6 style={{ marginBottom: 12 }}>Preferences</h6>

              <Form.Group className="mb-0">
                <Form.Label className="text-secondary-custom" style={labelStyle}>
                  Default Organization
                </Form.Label>
                <Form.Select
                  size="sm"
                  value={defaultOrg}
                  onChange={(e) => setDefaultOrg(e.target.value)}
                  className="date-dropdown"
                >
                  {orgs.map((o) => (
                    <option key={o.login} value={o.login}>
                      {o.login}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-secondary-custom" style={{ fontSize: "0.7rem" }}>
                  Default org for the Leaderboard tab.
                </Form.Text>
              </Form.Group>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={6}>
          <Card className="mb-3" style={{ minHeight: "auto" }}>
            <Card.Body>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h6 className="mb-0">Cache</h6>
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
              </div>
              {cacheStats && (
                <div style={{ fontSize: "0.8rem" }}>
                  <div
                    className="d-flex justify-content-between py-1"
                    style={{ borderBottom: "1px solid #d1d9e0" }}
                  >
                    <span className="text-secondary-custom">API cache entries</span>
                    <span>{cacheStats.apiCache}</span>
                  </div>
                  <div
                    className="d-flex justify-content-between py-1"
                    style={{ borderBottom: "1px solid #d1d9e0" }}
                  >
                    <span className="text-secondary-custom">Cached contributions</span>
                    <span>{cacheStats.contributions.toLocaleString()}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1">
                    <span className="text-secondary-custom">Cached profiles</span>
                    <span>{cacheStats.profiles}</span>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="mb-3" style={{ minHeight: "auto" }}>
        <Card.Body className="py-2 px-3">
          <div className="d-flex align-items-center gap-2" style={{ fontSize: "0.75rem" }}>
            <IconBrandGithub size={14} />
            <span className="text-secondary-custom">dev-home v{__APP_VERSION__}</span>
            <a
              href="https://github.com/sgtlaugh/dev-home"
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: "auto", fontSize: "0.7rem" }}
            >
              View on GitHub
            </a>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};
