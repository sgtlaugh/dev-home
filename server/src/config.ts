export interface ServerConfig {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  port: number;
}

const REQUIRED_ENV_VARS = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "GITHUB_TOKEN",
  "GITHUB_USERNAME",
] as const;

let runtimeConfig: ServerConfig | null = null;

/**
 * Store runtime configuration provided by the frontend.
 * The port is automatically derived from the environment or defaults to 3571.
 */
export function setRuntimeConfig(config: Omit<ServerConfig, "port">): void {
  runtimeConfig = {
    ...config,
    port: parseInt(process.env.VITE_API_PORT || "3571", 10),
  };
}

/**
 * Returns the current server configuration.
 * If runtime config has been set via setRuntimeConfig(), it takes precedence.
 * Otherwise falls back to environment variables.
 */
export function getConfig(): ServerConfig {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  const missing = validateEnv();
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Please copy .env.example to .env and fill in the values.",
    );
  }

  return {
    jiraBaseUrl: process.env.JIRA_BASE_URL!.replace(/\/$/, ""),
    jiraEmail: process.env.JIRA_EMAIL!,
    jiraApiToken: process.env.JIRA_API_TOKEN!,
    githubToken: process.env.GITHUB_TOKEN!,
    githubUsername: process.env.GITHUB_USERNAME!,
    port: parseInt(process.env.VITE_API_PORT || "3571", 10),
  };
}

/**
 * Returns true if the server is configured, either via runtime config
 * or via environment variables.
 */
export function isGithubConfigured(): boolean {
  if (runtimeConfig) {
    return !!(runtimeConfig.githubToken && runtimeConfig.githubUsername);
  }
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME);
}

export function missingGithubFields(): string[] {
  const token = runtimeConfig?.githubToken || process.env.GITHUB_TOKEN;
  const username = runtimeConfig?.githubUsername || process.env.GITHUB_USERNAME;
  const missing: string[] = [];
  if (!token) missing.push("githubToken");
  if (!username) missing.push("githubUsername");
  return missing;
}

export function isJiraConfigured(): boolean {
  if (runtimeConfig) {
    return !!(runtimeConfig.jiraBaseUrl && runtimeConfig.jiraEmail && runtimeConfig.jiraApiToken);
  }
  return !!(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
}

export function missingJiraFields(): string[] {
  const url = runtimeConfig?.jiraBaseUrl || process.env.JIRA_BASE_URL;
  const email = runtimeConfig?.jiraEmail || process.env.JIRA_EMAIL;
  const token = runtimeConfig?.jiraApiToken || process.env.JIRA_API_TOKEN;
  const missing: string[] = [];
  if (!url) missing.push("jiraBaseUrl");
  if (!email) missing.push("jiraEmail");
  if (!token) missing.push("jiraApiToken");
  return missing;
}

export function isConfigured(): boolean {
  return isGithubConfigured() || isJiraConfigured();
}

/**
 * Validate that all required env vars are present.
 * Returns an array of missing variable names (empty if all are set).
 */
export function validateEnv(): string[] {
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  return missing;
}
