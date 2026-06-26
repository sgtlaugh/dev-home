import cors from "cors";
import express, { Request, Response } from "express";
import "express-async-errors";
import {
  validateEnv,
  isGithubConfigured,
  isJiraConfigured,
  missingGithubFields,
  missingJiraFields,
} from "./config";
import { createGitHubClient } from "./clients/githubApiClient";
import { closeDb, getDb } from "./db";
import activityRoutes, { prefetchActivity } from "./routes/activity";
import configRoutes from "./routes/config";
import githubRoutes from "./routes/github";
import jiraRoutes, { resetJiraCache } from "./routes/jira";
import notesRoutes from "./routes/notes";
import systemRoutes from "./routes/system";
import { fetchOrgMembers } from "./routes/github/leaderboard";
import {
  startPrefetch,
  prefetchContributions,
  waitForLiveRequests,
} from "./services/contributionPrefetch";
import { errorHandler } from "./utils/errors";
import { apiCache } from "./utils/cache";
import { logger } from "./utils/logger";

export function createServer() {
  const app = express();

  // CORS — allow Vite dev server and Electron app origins
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (Electron, curl, etc.)
        if (!origin) return callback(null, true);

        if (
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:") ||
          origin.startsWith("file://") ||
          origin === "app://-"
        ) {
          return callback(null, true);
        }

        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );

  // JSON body parser
  app.use(express.json());

  // Routes that don't need API tokens
  app.use("/api/config", configRoutes);
  app.use("/api/notes", notesRoutes);
  app.use("/api/system", systemRoutes);

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const CACHE_CATEGORIES: Record<string, string[]> = {
    activity: ["activity_cache"],
    prs: ["prs", "sync_state"],
    orgLeaderboard: ["org_contributions"],
    profiles: ["github_profiles"],
    contributions: ["user_contribution_cache"],
  };

  const VALID_TABLES = new Set(Object.values(CACHE_CATEGORIES).flat());

  const countTable = (db: ReturnType<typeof getDb>, table: string) => {
    if (!VALID_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
    return (db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }).cnt;
  };

  app.get("/api/cache/stats", (_req: Request, res: Response) => {
    const db = getDb();
    res.json({
      activity: countTable(db, "activity_cache"),
      prs: countTable(db, "prs"),
      orgLeaderboard: countTable(db, "org_contributions"),
      profiles: countTable(db, "github_profiles"),
      contributions: countTable(db, "user_contribution_cache"),
    });
  });

  app.delete("/api/cache/:category", (req: Request, res: Response) => {
    const tables = CACHE_CATEGORIES[req.params.category];
    if (!tables) return res.status(404).json({ error: "Unknown category" });
    const db = getDb();
    for (const table of tables) {
      if (!VALID_TABLES.has(table)) continue;
      db.exec(`DELETE FROM ${table}`);
    }
    apiCache.clear();
    res.json({ status: `${req.params.category} cleared` });
  });

  app.post("/api/cache/purge", (_req: Request, res: Response) => {
    apiCache.clear();
    resetJiraCache();
    res.json({ status: "cache cleared" });
  });

  // Routes guarded by service-specific token checks
  const githubGuard = (_req: Request, res: Response, next: () => void) => {
    if (!isGithubConfigured()) {
      return res
        .status(503)
        .json({ error: "GitHub not configured", missing: missingGithubFields() });
    }
    next();
  };
  const jiraGuard = (_req: Request, res: Response, next: () => void) => {
    if (!isJiraConfigured()) {
      return res.status(503).json({ error: "JIRA not configured", missing: missingJiraFields() });
    }
    next();
  };

  app.use("/api/activity", activityRoutes);
  app.use("/api/jira", jiraGuard, jiraRoutes);
  app.use("/api/github", githubGuard, githubRoutes);

  // Error handling middleware — catches thrown errors from async routes
  app.use(errorHandler);

  return app;
}

export function startServer() {
  // Validate env vars
  const missingVars = validateEnv();
  if (missingVars.length > 0) {
    logger.warn("Config", `Missing environment variables: ${missingVars.join(", ")}`);
    logger.warn("Config", "Copy .env.example to .env and fill in the required values");
  }

  const app = createServer();
  const PORT = parseInt(process.env.VITE_API_PORT || "3571", 10);

  const server = app.listen(PORT, () => {
    logger.info("Server", `listening on http://localhost:${PORT}`);
    scheduleStartupPrefetch();
  });

  return server;
}

export function scheduleStartupPrefetch(delayMs = 5000): void {
  setTimeout(async () => {
    if (!isGithubConfigured()) {
      logger.info("Prefetch", "Not configured yet, skipping startup prefetch");
      return;
    }
    try {
      await waitForLiveRequests();
      await prefetchActivity();
    } catch (err: any) {
      logger.warn("Prefetch", `Activity prefetch failed: ${err.message}`);
    }
    try {
      await waitForLiveRequests();
      await prefetchContributions();
    } catch (err: any) {
      logger.warn("Prefetch", `Contributions prefetch failed: ${err.message}`);
    }
    try {
      await waitForLiveRequests();
      const { syncPRs } = await import("./services/prSync");
      await syncPRs();
    } catch (err: any) {
      logger.warn("Prefetch", `PR sync failed: ${err.message}`);
    }
    try {
      const github = createGitHubClient();
      const { data: orgs } = await github.get("/user/orgs", { params: { per_page: 100 } });
      if (orgs.length === 0) {
        logger.info("Prefetch", "No orgs found, skipping");
        return;
      }
      logger.info(
        "Prefetch",
        `Found ${orgs.length} orgs: ${orgs.map((o: any) => o.login).join(", ")}`,
      );
      for (const org of orgs) {
        const members = await fetchOrgMembers(org.login);
        await startPrefetch(org.login, members);
      }
    } catch (err: any) {
      logger.warn("Prefetch", `Startup prefetch failed: ${err.message}`);
    }
  }, delayMs);
}

// Graceful shutdown — close SQLite connection
process.on("SIGTERM", () => {
  apiCache.close();
  closeDb();
  process.exit(0);
});

process.on("SIGINT", () => {
  apiCache.close();
  closeDb();
  process.exit(0);
});
