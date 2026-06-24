import axios, { AxiosError, AxiosResponse } from "axios";
import { getConfig } from "../config";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 3000;
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

interface GraphQLResponse<T = any> {
  data: T & { rateLimit?: { limit: number; remaining: number; resetAt: string } };
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetAt: string;
}

let lastRateLimit: RateLimitStatus | null = null;

export function getLastRateLimit(): RateLimitStatus | null {
  return lastRateLimit;
}

function injectRateLimit(query: string): string {
  if (query.includes("rateLimit")) return query;
  return query.replace(/(\bquery\b[^{]*\{)/, "$1\n    rateLimit { limit remaining resetAt }");
}

/**
 * Execute a GitHub GraphQL query.
 * Automatically injects rateLimit field into every query for tracking.
 */
export async function graphql<T = any>(
  query: string,
  variables: Record<string, any> = {},
  label?: string,
): Promise<T> {
  const config = getConfig();
  const tag = label || "query";

  const enrichedQuery = injectRateLimit(query);

  for (let attempt = 0; ; attempt++) {
    logger.info("GraphQL", `${tag}: POST /graphql`);

    let response: AxiosResponse<GraphQLResponse<T>>;
    try {
      response = await axios.post(
        GITHUB_GRAPHQL_URL,
        { query: enrichedQuery, variables },
        {
          headers: {
            Authorization: `Bearer ${config.githubToken}`,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status && RETRYABLE_STATUS_CODES.has(status) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
        logger.warn(
          "GraphQL",
          `${tag}: got ${status}, retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }

    if (response.data.errors && response.data.errors.length > 0) {
      const messages = response.data.errors.map((e) => e.message).join("; ");
      logger.error("GraphQL", `${tag}: ${messages}`);
      const error: any = new Error(`GitHub GraphQL error: ${messages}`);
      error.graphqlErrors = response.data.errors;
      throw error;
    }

    const rl = response.data.data?.rateLimit;
    if (rl) {
      lastRateLimit = { limit: rl.limit, remaining: rl.remaining, resetAt: rl.resetAt };
      const resetTime = new Date(rl.resetAt).toLocaleTimeString();
      logger.info("GraphQL", `${tag}: ${rl.remaining}/${rl.limit} remaining (resets ${resetTime})`);
    }

    return response.data.data;
  }
}
