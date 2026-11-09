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
│  ├─ schedule.ts              daily schedule: validation, next/due/missed slots
│  ├─ stats.ts                 today / last-7-days counts and success rate from the log
│  ├─ notify.ts                text of the run-finished notification
│  ├─ run-engine.ts            pure run state machine
│  ├─ fb-dom.ts                ALL Facebook selectors and text hints
│  ├─ backup.ts                JSON backup: build, validate (`parseBackup`), merge (`planImport`)
│  ├─ csv.ts                   CSV export with formula-injection guard
│  ├─ storage.ts               typed storage items (groups, campaigns, logs, run)
│  └─ messages.ts              message types and guards
└─ ui/                         React components + SCSS (BEM)
tests/                         Vitest unit tests
e2e/smoke.py                   Playwright smoke test against a local mock
```

## Data model (`src/lib/types.ts`)

- `Group { id (slug), name, url }`
- `Campaign { id, name, variations[], groupIds[], delay{minSec,maxSec}, safetyBreak{enabled,everyPosts,breakMinutes}, schedule?{enabled,times["HH:mm"]}, mode?: 'post' | 'comment', commentsPerGroup?, createdAt }` (no `mode` means a post campaign)
- `LogEntry { id, ts, campaignId, groupId, groupName, status, message }` (last 2000 kept)
- `RunState { status, campaignId, queue[], total, attempted, consecutiveFailures, sinceBreak, nextAt, reason }`
- `PostOutcome = posted | skipped | failed | fatal`

## Run lifecycle

`idle → running ⇄ paused → done | stopped | halted`, and `stopped → running` through `continueRun`

1. **start**: validate campaign, `createRun` (nextAt = now), run the first step immediately.
2. **step** (`runStep`): take `queue[0]`; open the group in an inactive tab; wait for load (45 s); message the content script (retry up to 8 s); post timeout 40 s; always close the tab.
3. **applyOutcome** (pure): `fatal → halted`; failures in a row ≥ 5 → `paused`; queue empty → `done`; every N attempts → Safety Break; else next = now + random delay.
   A failure marked `retryable` (nothing was submitted) does not advance the queue the first time: `RunState.retrying` is set and the step repeats after `LIMITS.retryDelayMs`. Comment campaigns never retry. A `pending` outcome counts as sent.
4. A Stop/Pause pressed during a step wins: the outcome is logged but the state is not advanced.
5. On service-worker start, `restoreSchedule` recreates the alarm from `RunState.nextAt`.

## Group names

`fb-dom.readGroupName` reads the page title (fallback: first `h1`). The content script answers `cap/group-name`. The background uses it in two places: before a post (only if the name is still the id) and in `fetchGroupNames` (button, one tab at a time). `withReadName` never overwrites a user-typed name.

## Daily schedule

- Pure logic lives in `lib/schedule.ts` (normalise, validate, `nextOccurrence`, `dueOccurrences`, `isMissed`). Local time is recomputed on each call, so DST and time-zone changes are handled.
- One alarm, `cap-schedule`, points at the earliest next slot over all campaigns with the schedule on. It is recomputed when the alarm fires, when a campaign is saved or deleted, and when the service worker starts.
- When slots are due, `processSchedule` calls `startRun`, the same function behind `cap/run/start` (same `validateCampaign`, `createRun`, `LIMITS`). If a run is active the slot is skipped and logged. A slot more than 10 minutes late is logged as missed and not run.
- `local:scheduleCheck` stores the time of the last check so slots missed while Chrome was closed can be told apart from new ones. Saving a campaign resets it to now.
- A `halted` run calls `disableAllSchedules`.

## Continue, notifications, overview

- `continueRun` (pure) turns a `stopped` run back into `running` with a fresh delay and, for post campaigns, drops queued groups that have a posted or pending log entry since `startedAt`. The background refuses it while a step is still in flight.
- `notifyRunEnd` runs after each step. It checks `local:settings.notifyOnFinish` (default off), asks `describeRunEnd` for the text and calls `notifications.create`. Errors are swallowed so a notification can never affect the run.
- The Tổng quan view calls `summarize(logs, now)` on the stored log; there is no separate counter to keep in sync.

## Backup and restore

`src/lib/backup.ts` is pure; `storage.ts` adds `readBackupData` and `writeImportedData`; `BackupView` holds only state and events.

- **File:** `{ app, formatVersion: 1, exportedAt, appVersion, data: { groups, campaigns, settings, logs } }`. `local:run`, `local:commentedPosts` and `local:scheduleCheck` are never exported.
- **`parseBackup(text)`** refuses files over 5 MB, broken JSON, another `app` and a newer `formatVersion`. Otherwise it rebuilds every item from known fields only and passes values through `LIMITS`, `clampDelay`, `parseGroupSlug` and `validateTimes`. Invalid items are dropped and counted.
- **`planImport(current, backup)`** merges without deleting. An existing id keeps the current item. Groups also match by canonical URL, and campaign `groupIds` follow the match. Imported schedules are set to `enabled: false`. Logs merge by id and keep the newest `LIMITS.maxLogEntries`. File settings apply only when the current settings are the defaults.
- **Write:** the view merges again with fresh data on confirm. `writeImportedData` checks `isActive(run)` right before writing and refuses while a run is active. Nothing in this flow starts a run.

## Comment campaigns

A campaign with `mode: 'comment'` goes through the same run engine; only the step differs (`commentInGroup` instead of `postToGroup`).

1. Open the group feed with `sorting_setting=RECENT_ACTIVITY` and ask the content script (`cap/discover-posts`) for posts it can identify: a post link plus a creation time within 24 hours (`fb-dom.findRecentGroupPosts`).
2. Pick the first link not in `local:commentedPosts`. If none, the step is `skipped` and the rest of that group is skipped (`skipRemainingGroup`); a feed where no post can be identified is reported as such.
3. Save the post link and a run-slot key in `commentedPosts` **before** opening the editor. Post links never expire; slot keys expire after 7 days. An uncertain submission is therefore never retried.
4. Open the post and send `cap/comment`. The content script counts a comment as sent only when a new visible comment appears and the editor is empty.

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
