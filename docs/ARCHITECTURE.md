# Architecture

## Overview

```
 Options page / Popup (React)         Background service worker           Group tab (content script)
 ─────────────────────────────        ─────────────────────────────       ──────────────────────────
 edit groups, campaigns   ──storage──▶ reads campaigns/groups
 buttons: start/pause/... ──message──▶ handleCommand()
                                       createRun / applyOutcome (pure)
                                       chrome.alarms 'cap-next-post'
                                       tabs.create(group.url, inactive) ─▶ document_idle
                                       tabs.sendMessage('cap/post') ─────▶ submitPost(text)
                                       ◀───────── PostOutcome ───────────── open composer, type, press Post
                                       appendLog, save RunState, schedule
 UI re-renders via storage.watch ◀─────storage────────────────────────────
```

All state lives in `chrome.storage.local`; the UI and the worker never share memory. This makes the service worker restart-safe (MV3 workers are killed when idle).

## Source layout

```
src/
├─ entrypoints/
│  ├─ background.ts            run orchestration (alarms, tabs, messaging)
│  ├─ facebook.content/        content script on facebook.com/groups/*
│  ├─ options/                 dashboard page (opens in a tab)
│  └─ popup/                   toolbar popup (run bar + open dashboard)
├─ lib/                        framework-free, unit-tested logic
│  ├─ types.ts  limits.ts  id.ts
│  ├─ delay.ts                 random/clamped/recommended delays, warnings, formatting
│  ├─ groups.ts                URL validation and bulk parsing
│  ├─ run-engine.ts            pure run state machine
│  ├─ fb-dom.ts                ALL Facebook selectors and text hints
│  ├─ csv.ts                   CSV export with formula-injection guard
│  ├─ storage.ts               typed storage items (groups, campaigns, logs, run)
│  └─ messages.ts              message types and guards
└─ ui/                         React components + SCSS (BEM)
tests/                         Vitest unit tests
e2e/smoke.py                   Playwright smoke test against a local mock
```

## Data model (`src/lib/types.ts`)

- `Group { id (slug), name, url }`
- `Campaign { id, name, variations[], groupIds[], delay{minSec,maxSec}, safetyBreak{enabled,everyPosts,breakMinutes}, schedule?{enabled,times["HH:mm"]}, createdAt }`
- `LogEntry { id, ts, campaignId, groupId, groupName, status, message }` (last 2000 kept)
- `RunState { status, campaignId, queue[], total, attempted, consecutiveFailures, sinceBreak, nextAt, reason }`
- `PostOutcome = posted | skipped | failed | fatal`

## Run lifecycle

`idle → running ⇄ paused → done | stopped | halted`

1. **start**: validate campaign, `createRun` (nextAt = now), run the first step immediately.
2. **step** (`runStep`): take `queue[0]`; open the group in an inactive tab; wait for load (45 s); message the content script (retry up to 8 s); post timeout 40 s; always close the tab.
3. **applyOutcome** (pure): `fatal → halted`; failures in a row ≥ 5 → `paused`; queue empty → `done`; every N attempts → Safety Break; else next = now + random delay.
4. A Stop/Pause pressed during a step wins: the outcome is logged but the state is not advanced.
5. On service-worker start, `restoreSchedule` recreates the alarm from `RunState.nextAt`.

## Daily schedule

- Pure logic lives in `lib/schedule.ts` (normalise, validate, `nextOccurrence`, `dueOccurrences`, `isMissed`). Local time is recomputed on each call, so DST and time-zone changes are handled.
- One alarm, `cap-schedule`, points at the earliest next slot over all campaigns with the schedule on. It is recomputed when the alarm fires, when a campaign is saved or deleted, and when the service worker starts.
- When slots are due, `processSchedule` calls `startRun`, the same function behind `cap/run/start` (same `validateCampaign`, `createRun`, `LIMITS`). If a run is active the slot is skipped and logged. A slot more than 10 minutes late is logged as missed and not run.
- `local:scheduleCheck` stores the time of the last check so slots missed while Chrome was closed can be told apart from new ones. Saving a campaign resets it to now.
- A `halted` run calls `disableAllSchedules`.

## Content script

`submitPost(text)` mimics a person: detect checkpoint/block/no-permission → find composer trigger → click → wait for dialog textbox → `execCommand('insertText')` → wait for enabled Post button → click → success when the dialog closes. Any structural mismatch returns `failed` with a readable reason; warnings return `fatal`.

## Why these choices

| Choice | Reason |
|---|---|
| WXT | Current MV3 tooling: typed entrypoints, HMR, zip, cross-browser later |
| Logic in `lib/` | Testable without a browser; the browser parts stay thin |
| Storage as single source of truth | Restart-safe worker, trivially reactive UI |
| Selectors isolated in `fb-dom.ts` | Facebook changes; one file to fix |
| No scraping of the group list | Less risk and less code; users paste links |
| `chrome.alarms` (not `setTimeout`) | Survives worker suspension |
| React + SCSS | Requested modern stack; SCSS/BEM per team convention |
