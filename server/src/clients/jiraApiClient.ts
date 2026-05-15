import axios from "axios";
import { getConfig } from "../config";
import { logger } from "../utils/logger";

/**
 * Creates an Axios instance pre-configured for the JIRA REST API.
 *
 * Because the base URL and credentials come from runtime config (which can
 * change after startup via the settings UI), we build a fresh instance on
 * every call rather than caching a singleton.
 */
export function createJiraClient() {
  const config = getConfig();
  const credentials = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString("base64");

  const client = axios.create({
    baseURL: `${config.jiraBaseUrl}/rest/api/3`,
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  client.interceptors.request.use((config) => {
    logger.debug("JIRA", `${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      logger.debug("JIRA", `${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      const status = error?.response?.status;
      const url = error?.config?.url;
      logger.error("JIRA", `${status || "ERROR"} ${url}`);
      return Promise.reject(error);
    },
  );

  return client;
}
