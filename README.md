# Dev Home Dashboard

A developer dashboard built with Electron, React, and Express that integrates with JIRA and GitHub to provide a unified view of issues and pull requests.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Yarn
- A JIRA account with an API token
- A GitHub personal access token

## Setup

```bash
nvm use            # switch to Node 22
yarn install       # installs deps + rebuilds native modules (better-sqlite3)
cd server && yarn install && cd ..
```

JIRA and GitHub credentials can be configured from the in-app settings.

## Running Locally

```bash
yarn dev
```

Launches Electron app with Vite hot-reload. This is the primary way to run Dev Home - no separate build step needed for local use.

## Build and Packaging

```bash
yarn build        # compile frontend + backend (no Electron packaging)
yarn pack         # build + create unpacked app directory (in release/)
yarn dist         # build + package for current platform
yarn dist:mac     # build + package as macOS DMG (arm64)
```

The packaged output is written to the `release/` directory.
