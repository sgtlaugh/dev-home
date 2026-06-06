/**
 * GraphQL queries for GitHub API
 * All queries automatically include rateLimit via wrapWithRateLimit
 */

export const SEARCH_PRS_QUERY = `
  query SearchPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
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
          body
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
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const SEARCH_MY_PRS_QUERY = `
  query SearchMyPRs($query: String!, $first: Int!, $after: String) {
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
          body
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
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
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
          body
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
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
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
          body
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
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export interface ContributionChunk {
  alias: string;
  from: string;
  to: string;
}

export function buildContributionsQuery(chunks: ContributionChunk[]): string {
  const fragments = chunks.map(
    (c) => `${c.alias}: contributionsCollection(from: "${c.from}", to: "${c.to}") {
      totalCommitContributions
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
    }`,
  );
  return `query { viewer { id ${fragments.join("\n")} } }`;
}

export function buildForkHistoryQuery(fragments: string[]): string {
  return `query { ${fragments.join("\n")} }`;
}

