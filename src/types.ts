// Backend Configuration
export interface BackendConfig {
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
}

// JIRA Types
export interface JiraIssue {
  key: string;
  summary: string;
  status: {
    name: string;
    statusCategory: {
      colorName: string;
    };
  };
  priority: {
    name: string;
    iconUrl: string;
  };
  assignee: {
    displayName: string;
    avatarUrls: {
      "48x48": string;
    };
  };
  project: {
    key: string;
    name: string;
  };
  updated: string;
  self: string;
  description: string;
  fields: Record<string, any>;
}

export interface JiraComment {
  id: string;
  author: {
    displayName: string;
    avatarUrls: {
      "48x48": string;
    };
  };
  body: {
    text: string;
  };
  created: string;
  updated: string;
  self: string;
  issueKey: string;
  issueSummary: string;
}

// GitHub Types
export interface CheckRunInfo {
  name: string;
  status: string;
  url: string | null;
}

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  merged: boolean;
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
  body: string;
  repository_url: string;
  repo_full_name: string;
  checks_status: string | null;
  checks: CheckRunInfo[];
  review_status: string | null;
}

export interface GitHubComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  issue_url: string;
  pr_number: number;
  repo_full_name: string;
  context_title: string;
  reason: string;
}

export type GitHubReviewRequest = GitHubPR;

// Note Types
export type NoteType = "free_text" | "jira_ticket" | "github_pr" | "link";

export interface Note {
  id: number;
  type: NoteType;
  title: string;
  content: string;
  reference_id: string | null;
  resolved: number;
  created_at: string;
  updated_at: string;
}
