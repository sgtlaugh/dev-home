import axios from "axios";
import { getConfig } from "../config";
import { logger } from "../utils/logger";

const GITHUB_API = "https://api.github.com";

/**
 * Creates an Axios instance pre-configured for the GitHub REST API.
 *
 * A fresh instance is built on every call so it always picks up the
 * latest token from runtime config.
 */
export function createGitHubClient(baseUrl: string = GITHUB_API) {
  const config = getConfig();
  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  client.interceptors.request.use((config) => {
    logger.debug("GitHub", `${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  });

  const RETRYABLE = new Set([502, 503, 504]);
  const MAX_RETRIES = 3;

  client.interceptors.response.use(
    (response) => {
      logger.debug("GitHub", `${response.status} ${response.config.url}`);
      return response;
    },
    async (error) => {
      const status = error?.response?.status;
      const url = error?.config?.url;
      const attempt = (error.config.__retryCount || 0) + 1;

      if (status && RETRYABLE.has(status) && attempt <= MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        logger.warn(
          "GitHub",
          `${status} ${url}, retrying in ${delay}ms (${attempt}/${MAX_RETRIES})`,
        );
        error.config.__retryCount = attempt;
        await new Promise((r) => setTimeout(r, delay));
        return client.request(error.config);
      }

      if (status === 404) {
        logger.debug("GitHub", `${status} ${url}`);
      } else {
        logger.error("GitHub", `${status || "ERROR"} ${url}`);
      }
      return Promise.reject(error);
    },
  );

  return client;
}
