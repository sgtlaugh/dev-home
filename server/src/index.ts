import cors from "cors";
import express, { Request, Response } from "express";
import "express-async-errors";
import { validateEnv, isConfigured } from "./config";
import { createGitHubClient } from "./clients/githubApiClient";
import { closeDb, getDb } from "./db";
import activityRoutes from "./routes/activity";
import configRoutes from "./routes/config";
import githubRoutes from "./routes/github";
import jiraRoutes, { resetJiraCache } from "./routes/jira";
import notesRoutes from "./routes/notes";
import systemRoutes from "./routes/system";
import { fetchOrgMembers } from "./routes/github/leaderboard";
import { clearProfiles } from "./services/contributionCache";
import { startPrefetch } from "./services/contributionPrefetch";
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

  // Routes
  app.use("/api/activity", activityRoutes);
  app.use("/api/jira", jiraRoutes);
  app.use("/api/github", githubRoutes);
  app.use("/api/config", configRoutes);
  app.use("/api/notes", notesRoutes);
  app.use("/api/system", systemRoutes);
  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/cache/stats", (_req: Request, res: Response) => {
    const db = getDb();
    const contributions = db.prepare("SELECT COUNT(*) as cnt FROM org_contributions").get() as { cnt: number };
    const profiles = db.prepare("SELECT COUNT(*) as cnt FROM github_profiles").get() as { cnt: number };
    const userContribs = db.prepare("SELECT COUNT(*) as cnt FROM user_contribution_cache").get() as { cnt: number };
    const prMonths = db.prepare("SELECT COUNT(*) as cnt FROM user_contribution_cache WHERE prs_json IS NOT NULL").get() as { cnt: number };
    const commitMonths = db.prepare("SELECT COUNT(*) as cnt FROM user_contribution_cache WHERE commit_count IS NOT NULL").get() as { cnt: number };
    res.json({
      apiCache: apiCache.size(),
      contributions: contributions.cnt,
      profiles: profiles.cnt,
      userContributions: { total: userContribs.cnt, prMonths: prMonths.cnt, commitMonths: commitMonths.cnt },
    });
  });
  app.post("/api/cache/purge", (_req: Request, res: Response) => {
    apiCache.clear();
    clearProfiles();
    resetJiraCache();
    res.json({ status: "cache cleared" });
  });

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

export function scheduleStartupPrefetch(): void {
  setTimeout(async () => {
    if (!isConfigured()) {
      logger.info("Prefetch", "Not configured yet, skipping startup prefetch");
      return;
    }
    try {
      // Pre-warm contributions cache (PRs + commits) first
      const { prefetchContributions } = await import("./services/contributionsPrefetch");
      await prefetchContributions();
    } catch (err: any) {
      logger.warn("Prefetch", `Contributions prefetch failed: ${err.message}`);
    }
    try {
      const { syncPRs } = await import("./services/prSync");
      await syncPRs();
    } catch (err: any) {
      logger.warn("Prefetch", `PR sync failed: ${err.message}`);
    }
    try {
      const { prefetchActivity } = await import("./routes/activity");
      await prefetchActivity();
    } catch (err: any) {
      logger.warn("Prefetch", `Activity prefetch failed: ${err.message}`);
    }
    try {
      const github = createGitHubClient();
      const { data: orgs } = await github.get("/user/orgs", { params: { per_page: 100 } });
      if (orgs.length === 0) {
        logger.info("Prefetch", "No orgs found, skipping");
        return;
      }
      logger.info("Prefetch", `Found ${orgs.length} orgs: ${orgs.map((o: any) => o.login).join(", ")}`);
      for (const org of orgs) {
        const members = await fetchOrgMembers(org.login);
        await startPrefetch(org.login, members);
      }
    } catch (err: any) {
      logger.warn("Prefetch", `Startup prefetch failed: ${err.message}`);
    }
  }, 5000);
}

// Graceful shutdown — close SQLite connection
process.on("SIGTERM", () => {
  closeDb();
  process.exit(0);
});

process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});
