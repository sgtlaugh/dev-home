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

  client.interceptors.response.use(
    (response) => {
      logger.debug("GitHub", `${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      const status = error?.response?.status;
      const url = error?.config?.url;
      logger.error("GitHub", `${status || "ERROR"} ${url}`);
      return Promise.reject(error);
    },
  );

  return client;
}
