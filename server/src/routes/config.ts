import { Router, Request, Response } from "express";
import {
  isConfigured,
  isGithubConfigured,
  isJiraConfigured,
  setRuntimeConfig,
  getConfig,
} from "../config";
import { scheduleStartupPrefetch } from "../index";

const router = Router();

/**
 * GET /api/config
 * Returns configuration status without exposing secrets.
 */
router.get("/", (_req: Request, res: Response) => {
  let jiraBaseUrl = "";
  let githubUsername = "";

  try {
    const config = getConfig();
    jiraBaseUrl = config.jiraBaseUrl;
    githubUsername = config.githubUsername;
  } catch {
    // Config not available yet — fall back to empty strings
  }

  res.json({
    configured: isConfigured(),
    githubConfigured: isGithubConfigured(),
    jiraConfigured: isJiraConfigured(),
    jiraBaseUrl: jiraBaseUrl.replace(/\/+$/, ""),
    githubUsername,
  });
});

/**
 * POST /api/config
 * Accepts runtime configuration from the frontend.
 */
router.post("/", (req: Request, res: Response) => {
  const { jiraBaseUrl, jiraEmail, jiraApiToken, githubToken, githubUsername } = req.body || {};

  const wasPreviouslyConfigured = isConfigured();

  setRuntimeConfig({
    jiraBaseUrl: ((jiraBaseUrl as string) || "").replace(/\/+$/, ""),
    jiraEmail: (jiraEmail as string) || "",
    jiraApiToken: (jiraApiToken as string) || "",
    githubToken: (githubToken as string) || "",
    githubUsername: (githubUsername as string) || "",
  });

  if (!wasPreviouslyConfigured && isConfigured()) {
    scheduleStartupPrefetch();
  }

  res.json({ success: true });
});

/**
 * GET /api/config/settings
 * Returns non-secret settings for the settings form to populate.
 * API tokens are never exposed.
 */
router.get("/settings", (_req: Request, res: Response) => {
  let jiraBaseUrl = "";
  let jiraEmail = "";
  let githubUsername = "";

  try {
    const config = getConfig();
    jiraBaseUrl = config.jiraBaseUrl;
    jiraEmail = config.jiraEmail;
    githubUsername = config.githubUsername;
  } catch {
    // Config not available yet — fall back to empty strings
  }

  res.json({
    configured: isConfigured(),
    githubConfigured: isGithubConfigured(),
    jiraConfigured: isJiraConfigured(),
    jiraBaseUrl,
    jiraEmail,
    githubUsername,
  });
});

export default router;
