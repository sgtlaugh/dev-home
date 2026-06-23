<p align="center">
  <img src="public/devhome-logo.svg" width="120" alt="Dev Home" />
</p>

<h1 align="center">Dev Home</h1>

<p align="center">
  A personal developer dashboard that brings JIRA, GitHub, and your notes into one place.
  <br/><br/>
  Yes, there's a chess puzzle.<br/>
  No, it won't count as a commit.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/electron-36-0969da?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18-1a7f37?logo=react&logoColor=white" alt="React" />
</p>

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/b8a0b3c4-cead-45f2-a301-1c6ca434fe44" width="800" alt="Dev Home Screenshot" />
</p>

## Features

- Summary Dashboard
- Activity Timeline
- Team Activity
- Contribution Stats
- Leaderboard
- JIRA Notifications
- Rich Notes

## Quick Start

```bash
nvm use                                # Node 22 (see .nvmrc)
yarn install                           # installs deps + rebuilds native modules
cd server && yarn install && cd ..     # install server deps
yarn dev                               # launch the app
```

Requires [Node.js](https://nodejs.org/) 22 and [Yarn](https://yarnpkg.com/).

## Configuration

Go to **Settings** in the app and add the following:

- <details>
  <summary><strong>GitHub</strong> - Personal access token with <code>repo</code>, <code>read:org</code>, and <code>read:user</code> scopes.</summary>

  Generate one [here](https://github.com/settings/tokens).

  <img width="700" alt="GitHub token setup" src="https://github.com/user-attachments/assets/ebb57a59-2d32-4c14-8345-78285c9c5b37" />

  </details>

- <details>
  <summary><strong>JIRA</strong> - Base URL, email, and API token.</summary>

  Base URL is your Atlassian domain (e.g. `https://yourcompany.atlassian.net`). Generate an API token [here](https://id.atlassian.com/manage-profile/security/api-tokens).

  <img width="700" alt="JIRA token setup" src="https://github.com/user-attachments/assets/9f56b072-da67-4eda-a433-7627b9574f7f" />

  </details>

## Build and Packaging

```bash
yarn build        # compile frontend + backend
yarn dist         # build + package for current platform (output in release/)
yarn dist:mac     # build + package as macOS DMG (arm64)
```

## Screenshots

| GitHub Activity | Leaderboard | Contributions |
|---------|----------|-------|
| ![GitHub Activity](https://github.com/user-attachments/assets/fa5f67f9-2c08-4106-b450-d5ae5e24f6e3) | ![Leaderboard](https://github.com/user-attachments/assets/f74e635d-73e0-4f53-9388-b01ceb3eda79) | ![Contributions](https://github.com/user-attachments/assets/a23dde91-3c0a-4cea-835f-3d340eef41ca) |

