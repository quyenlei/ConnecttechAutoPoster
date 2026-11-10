# Connecttech Auto Poster (CAP)

A local-first Chrome extension that helps you post to the Facebook groups **you have joined**, with safe delays, rotating post versions and a clear activity log.

- **No account, no license server, no backend.** Everything is stored on your device (`chrome.storage.local`).
- **You stay in control.** You choose the groups and the text; you can pause or stop any time.
- **Safe by default.** Minimum wait, recommended delays, Safety Break, auto-pause after repeated failures, stop on Facebook warnings.

> Status: **v0.3**. The posting, schedule and comment flows are verified end to end against a local mock of a group page. The project owner has also run the extension by hand on live Facebook and confirmed that it works. That check was manual and is not covered by automated tests, and Facebook's layout changes often, so selectors may need fixing again. See [Known limits](#known-limits).

## Features

| Area | What works |
|---|---|
| Groups | Paste group links (one per line, optional name), duplicates and non-group links rejected |
| Campaigns | Several saved campaigns, 1–10 post versions rotating across groups, up to 100 groups |
| Timing | Random wait range (min 30 s), recommended delay by group count, warnings for risky settings, time estimate |
| Safety | Safety Break every N posts, auto-pause after 5 failures in a row, immediate halt on checkpoint or "temporarily blocked", skip groups you cannot post in |
| Run control | Pause, Resume, Stop, continue a stopped run, one retry after temporary errors, live countdown, progress, survives browser/service-worker restarts |
| Activity | Filter by status (including posts waiting for admin approval), export CSV (spreadsheet-formula safe), clear |
| Overview | Sent and failed counts for today and the last 7 days, success rate, opt-in desktop notifications |
| Comments | Comment campaigns: comment on recent posts (last 24 h) in each group. Scans the feed in a visible tab of your current window with scrolling, reads the post time (hovering the time label when needed), skips posts you already commented on, per-group limit and local protection against commenting twice (mock-tested only) |
| Schedule | Optional daily start times (max 2 per campaign, at least 6 h apart) |
| UI | Light/dark automatically, keyboard accessible, Vietnamese UI |

## Tech stack

[WXT](https://wxt.dev) (Manifest V3 build tooling) · TypeScript 7 (strict) · React 19 · SCSS (BEM) · Vitest 5 + happy-dom · Playwright smoke test. No Tailwind, no Bootstrap, no runtime network libraries.

## Quick start

```bash
pnpm install
pnpm dev        # opens a dev Chrome with live reload (needs a Chromium that allows --load-extension)
pnpm build      # production build in .output/chrome-mv3
```

Install manually: open `chrome://extensions`, enable **Developer mode**, **Load unpacked**, select `.output/chrome-mv3`. Log in to Facebook in the same Chrome profile, then click the extension icon and **Open dashboard**.

## Using it

1. **Groups** tab: paste links such as `https://www.facebook.com/groups/example | My group`.
2. **Campaigns** tab: **New**, write your post (add versions if you like), tick groups, review timing, **Save and launch**.
3. Watch the run bar. The first post goes out immediately; waits apply between posts. Details: [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

Start with 5–10 groups and the recommended delay.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with HMR |
| `pnpm build` / `pnpm zip` | Production build / store zip |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit and DOM tests |
| `pnpm test:e2e` | Build, then run the browser smoke test against a local mock (no real network) |

## Documentation

| Doc | Content |
|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | How to use CAP |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, data model, run lifecycle |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, testing, debugging, release |
| [docs/SAFETY_AND_PRIVACY.md](docs/SAFETY_AND_PRIVACY.md) | Safety rules, permissions, privacy, compliance |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Done, next, later |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [CLAUDE.md](CLAUDE.md) | Guide for AI assistants |

## Known limits

- Facebook offers **no public API** for posting to groups. CAP drives the visible web UI like a person would, so it can break when Facebook changes its markup. All selectors live in [`src/lib/fb-dom.ts`](src/lib/fb-dom.ts) with English and Vietnamese hints.
- Browser must stay open; the posting tabs open in the background and close themselves.
- Text posts and text comments only (no photos or link previews). Scheduling is limited to fixed daily times, max 2 per campaign (v0.2).
- Comment campaigns need their Facebook tab to be the visible tab, and depend on Facebook showing the post time (directly or under the pointer); when CAP cannot tell a post's age it skips the post instead of guessing (except in the opt-in newest-posts mode).
- Automating Facebook can violate its Terms and can get an account limited. You are responsible for your use. See [docs/SAFETY_AND_PRIVACY.md](docs/SAFETY_AND_PRIVACY.md).

## Origin and independence

CAP is an original, clean-room codebase written from public feature descriptions only. It contains no code, assets or branding from other products and has no dependency on third-party services.

Maintained by **Connecttech**. License: to be decided by the owner (all rights reserved until then).
