<p align="center">
  <img src="public/devhome-logo.svg" width="120" alt="Dev Home" />
</p>

<h1 align="center">Dev Home</h1>

<p align="center">
  A personal developer dashboard that brings JIRA, GitHub, and your notes into one place.
  <br/><br/>
  Dashboard · Activity · Contributions · Leaderboard · Notes · Notifications
  <br/><br/>
  <sub>Yes, there's a chess puzzle. No, it won't count as a commit.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/electron-36-0969da?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://github.com/sgtlaugh/dev-home/actions/workflows/ci.yml/badge.svg" alt="CI" />
</p>

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/b8a0b3c4-cead-45f2-a301-1c6ca434fe44" width="800" alt="Dev Home Screenshot" />
</p>

## Download

Grab the latest release for your platform from [Releases](https://github.com/sgtlaugh/dev-home/releases).

## Configuration

Go to **Settings** in the app and add the following:

| Service | What you need | Where to get it |
|---------|--------------|----------------|
| **GitHub** | Personal access token (`repo`, `read:org`, `read:user`) | [Generate token](https://github.com/settings/tokens) |
| **JIRA** | Base URL, email, API token | [Generate token](https://id.atlassian.com/manage-profile/security/api-tokens) |

<details>
<summary><strong>GitHub</strong></summary>
<br/>

<img width="700" alt="GitHub token setup" src="https://github.com/user-attachments/assets/ebb57a59-2d32-4c14-8345-78285c9c5b37" />

</details>

<details>
<summary><strong>JIRA</strong></summary>
<br/>

<img width="700" alt="JIRA token setup" src="https://github.com/user-attachments/assets/9f56b072-da67-4eda-a433-7627b9574f7f" />

</details>

> [!TIP]
> At least one of GitHub or JIRA is required. Unconfigured features show empty states.

## Screenshots

| GitHub Activity | Leaderboard | Contributions |
|---------|----------|-------|
| ![GitHub Activity](https://github.com/user-attachments/assets/fa5f67f9-2c08-4106-b450-d5ae5e24f6e3) | ![Leaderboard](https://github.com/user-attachments/assets/f74e635d-73e0-4f53-9388-b01ceb3eda79) | ![Contributions](https://github.com/user-attachments/assets/a23dde91-3c0a-4cea-835f-3d340eef41ca) |

## Development

Requires [Node.js 22](https://nodejs.org/) and [Yarn](https://yarnpkg.com/).

### Quick Start

```bash
nvm use                                # Node 22 (see .nvmrc)
yarn install                           # installs deps + rebuilds native modules
cd server && yarn install && cd ..     # install server deps
yarn dev                               # launch the app
```

### Tests & Lint

```bash
yarn test                              # run frontend tests
cd server && yarn test                 # run server tests
yarn test:all                          # run all tests

yarn lint:all                          # run lint + prettier (frontend + server)
yarn fix:all                           # auto-fix lint issues
```

> [!NOTE]
> CI runs lint and tests on every push and PR to `master`.

### Build from Source

```bash
yarn build        # compile frontend + backend
yarn dist         # build + package for current platform (output in release/)
yarn dist:mac     # build + package as macOS DMG (arm64)
```

<details>
<summary><strong>Good to Know</strong></summary>
<br/>

| | |
|---|---|
| **Rate limits** | GitHub allows `5000` API requests/hour. The app caches aggressively, but Leaderboard prefetch for orgs (`~300` members) can take a few hours on first run. |
| **Caching** | Responses are cached in SQLite with TTL. Refresh or clear cache from Settings to force fresh data. |
| **Partial config** | GitHub-only or JIRA-only setups work fine. Unconfigured features show empty states. |

</details>

## Acknowledgements

Originally inspired by [siddiqus/dev-home](https://github.com/siddiqus/dev-home). The project has since diverged significantly in features and architecture.
