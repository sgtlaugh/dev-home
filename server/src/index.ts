import cors from "cors";
import express, { Request, Response } from "express";
import "express-async-errors";
import { validateEnv } from "./config";
import { closeDb, getDb } from "./db";
import activityRoutes from "./routes/activity";
import configRoutes from "./routes/config";
import githubRoutes from "./routes/github";
import jiraRoutes, { resetJiraCache } from "./routes/jira";
import notesRoutes from "./routes/notes";
import { errorHandler } from "./utils/errors";
import { apiCache } from "./utils/cache";
import { logger } from "./utils/logger";
import { clearProfiles } from "./services/contributionCache";

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
  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/cache/stats", (_req: Request, res: Response) => {
    const db = getDb();
    const contributions = db.prepare("SELECT COUNT(*) as cnt FROM org_contributions").get() as { cnt: number };
    const profiles = db.prepare("SELECT COUNT(*) as cnt FROM github_profiles").get() as { cnt: number };
    res.json({
      apiCache: apiCache.size(),
      contributions: contributions.cnt,
      profiles: profiles.cnt,
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
  });

  return server;
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
