/**
 * GraphQL queries for GitHub API
 * All queries automatically include rateLimit via wrapWithRateLimit
 */

export const SEARCH_PRS_QUERY = `
  query SearchPRs($query: String!, $first: Int!, $after: String) {
    search(query: $query, type: ISSUE, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          merged
          mergedAt
          mergedBy { login avatarUrl }
          closedAt
          createdAt
          updatedAt
          author { login avatarUrl }
          headRefName
          baseRefName
          additions
          deletions
          repository { nameWithOwner url }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
          reviews(last: 20) {
            nodes {
              state
              author { login avatarUrl }
              submittedAt
            }
          }
        }
      }
    }
  }
`;

export const SEARCH_TEAM_ACTIVITY_QUERY = `
  query SearchTeamActivity($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          number
          title
          url
          state
          merged
          mergedAt
          mergedBy { login avatarUrl }
          repository { nameWithOwner }
          reviews(last: 50) {
            nodes {
              state
              body
              author { login avatarUrl }
              submittedAt
            }
          }
          comments(last: 50) {
            nodes {
              body
              createdAt
              url
              author { login avatarUrl }
            }
          }
          reviewThreads(last: 30) {
            nodes {
              comments(last: 20) {
                nodes {
                  body
                  createdAt
                  url
                  author { login avatarUrl }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const COMBINED_DASHBOARD_QUERY = `
  query CombinedDashboard($myPRsQuery: String!, $reviewsQuery: String!, $first: Int!) {
    myPRs: search(query: $myPRsQuery, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          merged
          mergedAt
          mergedBy { login avatarUrl }
          closedAt
          createdAt
          updatedAt
          author { login avatarUrl }
          headRefName
          baseRefName
          additions
          deletions
          repository { nameWithOwner url }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
          reviews(last: 20) {
            nodes {
              state
              author { login avatarUrl }
              submittedAt
            }
          }
        }
      }
    }
    reviews: search(query: $reviewsQuery, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          merged
          mergedAt
          mergedBy { login avatarUrl }
          closedAt
          createdAt
          updatedAt
          author { login avatarUrl }
          headRefName
          baseRefName
          additions
          deletions
          repository { nameWithOwner url }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
          reviews(last: 20) {
            nodes {
              state
              author { login avatarUrl }
              submittedAt
            }
          }
        }
      }
    }
  }
`;
