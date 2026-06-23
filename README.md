<p align="center">
  <img src="public/devhome-logo.svg" width="120" alt="Dev Home" />
</p>

<h1 align="center">Dev Home</h1>

<p align="center">
  A personal developer dashboard that brings JIRA, GitHub, and your notes into one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/electron-36-47848f?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18-61dafb?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform" />
</p>

---

<!-- Replace the placeholder URL below with an actual screenshot.
     Easiest way: edit this file on GitHub, drag-drop a screenshot into the editor,
     and GitHub will generate a permanent URL for you. -->

<p align="center">
  <img src="https://github.com/user-attachments/assets/placeholder" width="800" alt="Dev Home Screenshot" />
</p>

## Features

- **Summary dashboard** - open PRs, review requests, JIRA tasks, and notifications at a glance
- **Activity timeline** - last 30 days of JIRA and GitHub activity with filtering
- **Team activity** - see what your teammates are up to across PRs
- **Rich notes** - markdown-powered notes with a built-in editor
- **Contribution stats** - GitHub contribution graph and monthly stats
- **Dark and light themes** - automatic or manual toggle

## Quick Start

```bash
nvm use                                # Node 22 (see .nvmrc)
yarn install                           # installs deps + rebuilds native modules
cd server && yarn install && cd ..     # install server deps
yarn dev                               # launch the app
```

JIRA and GitHub credentials are configured from the in-app settings page.

## Build and Packaging

```bash
yarn build        # compile frontend + backend
yarn dist         # build + package for current platform
yarn dist:mac     # build + package as macOS DMG (arm64)
```

Output goes to `release/`.

## Screenshots

<!-- Add more screenshots here - Activity tab, Notes, Settings, etc.
     Drag-drop images when editing on GitHub to auto-upload. -->

| Summary | Activity | Notes |
|---------|----------|-------|
| ![Summary](https://github.com/user-attachments/assets/placeholder) | ![Activity](https://github.com/user-attachments/assets/placeholder) | ![Notes](https://github.com/user-attachments/assets/placeholder) |

## License

MIT
