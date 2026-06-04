import { Router, Request, Response } from "express";
import { createGitHubClient } from "../../clients/githubApiClient";
import { logger } from "../../utils/logger";
import { ACTIVITY_LOOKBACK_DAYS } from "../../utils/constants";
import {
  monthsAgo,
  fetchAllNotifications,
  fetchCommentsInBatches,
  isBot,
} from "./helpers";

const router = Router();

/**
 * GET /api/github/mentions
 * Fetch GitHub mentions from the notifications API (participating, all, 2-month window).
 */
router.get("/mentions", async (_req: Request, res: Response) => {
  const github = createGitHubClient();
  const since = `${monthsAgo(Math.ceil(ACTIVITY_LOOKBACK_DAYS / 30))}T00:00:00Z`;

  try {
    const allNotifications = await fetchAllNotifications(github, since);
    const mentions = await fetchCommentsInBatches(allNotifications, github);

    const seen = new Set<number | string>();
    const deduplicated = mentions.filter((m) => {
      if (!m.user?.login) return false;
      if (isBot(m.user.login)) return false;
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    deduplicated.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    res.json({ mentions: deduplicated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Mentions", message);
    res.status(500).json({ error: "Failed to fetch mentions" });
  }
});

export default router;
