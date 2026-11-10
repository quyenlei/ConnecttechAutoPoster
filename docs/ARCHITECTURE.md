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
│  ├─ comment-pick.ts          pure choice of the feed post to comment on, scan summary
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
- `Campaign { id, name, variations[], groupIds[], delay{minSec,maxSec}, safetyBreak{enabled,everyPosts,breakMinutes}, schedule?{enabled,times["HH:mm"]}, mode?: 'post' | 'comment', commentsPerGroup?, images?: CampaignImage[], removeLinkPreview?, createdAt }` (no `mode` means a post campaign)
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

- **File:** `{ app, formatVersion: 1, exportedAt, appVersion, data: { groups, campaigns, settings, logs } }`. `local:run`, `local:commentedPosts`, `local:commentTab` and `local:scheduleCheck` are never exported.
- **`parseBackup(text)`** refuses files over 8 MB (`MAX_BACKUP_BYTES`, sized for the image limit), broken JSON, another `app` and a newer `formatVersion`. Otherwise it rebuilds every item from known fields only and passes values through `LIMITS`, `clampDelay`, `parseGroupSlug` and `validateTimes`. Invalid items are dropped and counted.
- **`planImport(current, backup)`** merges without deleting. An existing id keeps the current item. Groups also match by canonical URL, and campaign `groupIds` follow the match. Imported schedules are set to `enabled: false`. Logs merge by id and keep the newest `LIMITS.maxLogEntries`. File settings apply only when the current settings are the defaults.
- **Write:** the view merges again with fresh data on confirm. `writeImportedData` checks `isActive(run)` right before writing and refuses while a run is active. Nothing in this flow starts a run.

## Joined groups import

`cap/run/fetch-joined` (Groups tab button) runs `fetchJoinedGroups` in the background: an active tab in the current window on `facebook.com/groups/joins/` (`openVisibleTab`), then `cap/joined-groups` to the content script. `readJoinedList` waits for `fb-dom.findJoinedGroupsSection` (the largest block around the "Tất cả các nhóm bạn đã tham gia" heading that holds no other heading, so pending requests and navigation stay out), scrolls to the end until the count stops growing three times (or `LIMITS.maxJoinedGroups` / `joinedScanTimeoutMs`), and returns `readJoinedGroups` (one entry per `/groups/<id>/` link, first text that is not "Xem nhóm" as the name) plus the heading count. The result goes to `local:joinedScan` and the window closes. `GroupsView` shows `groups.previewJoinedGroups` and writes `groups.addJoinedGroups` for the ticked rows only.

## Comment campaigns

A campaign with `mode: 'comment'` goes through the same run engine; only the step differs (`commentInGroup` instead of `postToGroup`). Mock-tested only; not verified on live Facebook.

1. **Tab** (`openGroupFeed`, `openVisibleTab`): an active tab in the window the user is in (no new window; Chrome hardly renders hidden tabs, so Facebook loads no more feed posts there). `local:commentTab` stores `{ tabId, windowId, returnTabId, groupId, runStartedAt }`. The next comment in the same group and run reuses the loaded feed (bringing the tab to the front again if the user switched away); another group navigates the same tab (`newestPostsGroupUrl`, `sorting_setting=CHRONOLOGICAL`); another run closes it and opens a new one. `closeCommentWindow` closes the tab and re-activates `returnTabId`; it runs when a run starts, after a step whose state is not `running`, and on pause/stop/reset when no step is in flight.
2. **Scan** (`cap/feed-pick`, content script `pickFeedPost`): walks `fb-dom.findFeedItems` from the top. Each item is scrolled into view and waited for (`isFeedItemRendered`); when the loaded items run out, the page is scrolled to the end to load more. `fb-dom.readFeedPost` returns fingerprint, post link, age (`PostAge` min/max from `parseAgeLabel`, tooltips, `time`, `readStructuredPostTimes`), whether the post already shows the user's comment (`findMyName`, `hasMyComment`), and the editor or "Bình luận" button. When the age is unknown, `revealTime` hovers up to 4 `findTimestampTargets` once each and reads again. `comment-pick.judgeFeedPost` (pure) decides; the first accepted post is kept in page memory and its keys (`commentKeys`: link and `feed:<groupId>:<fingerprint>`) are returned. Limits: `LIMITS.feedScanMaxPosts`, `feedScanTimeoutMs`, `newestFeedWindow`; recent mode also stops at 3 old posts in a row (`feedIsExhausted`). Nothing found → `skipped` with `skipRemainingGroup` and `describeScan` as the reason.
3. **Reserve**: the background saves the keys and the run slot in `commentedPosts` before asking for the comment. Post links and fingerprints never expire; slot keys expire after 7 days. A `retryable` failure (nothing typed) releases the keys.
4. **Comment** (`cap/feed-comment`): checks the fingerprint matches the kept post, uses its editor or clicks its "Bình luận" button (inline editor or dialog, closed with Escape afterwards), types, sends (button or Enter), and counts it as sent only when the editor is empty and a new visible comment with the text appears.

## Post content: `{group}`, images, link preview

- **`{group}`** (`src/lib/template.ts`, pure): `postToGroup` in `background.ts` is the only place that replaces it. It reads the stored group name right before building the `cap/post` request (after a name may have just been read from the page), so the content script and the log never see the template. A placeholder-only name (the slug) counts as unknown and becomes "bạn". A result over `LIMITS.maxPostLength` fails the group, like `validateCampaign` does for a raw post.
- **Images** (`src/lib/images.ts`, pure checks; `src/ui/image-file.ts` shrinks with a canvas): stored as data URLs inside the campaign in `chrome.storage.local`, so they stay within the 10 MiB quota (4 MB of images is about 5.4 MB as base64) and no `unlimitedStorage` permission is needed. Limits are enforced when saving (UI), when starting a run (`validateCampaign`) and when importing a backup (`sanitizeImage`, which recomputes the size from the data).
- **How images travel:** nothing is sent around in advance. The background puts `images` into the single `cap/post` request for one group, taken from the campaign it already holds in memory, and sends nothing for campaigns without images. This avoids a second storage read in the content script and keeps large strings out of any other message.
- **Link preview:** `removeLinkPreview` rides in the same request.

## Content script

`submitPost(request)` mimics a person: detect checkpoint/block/no-permission → find composer trigger → click → wait for dialog textbox → `execCommand('insertText')` → (images: find the composer's file input, set the files with `DataTransfer`, send `input`/`change`, wait for the previews and for no progress bar; no input or no finish means `failed`, retryable because nothing was sent) → (link preview: wait once for the close button, click it if present) → wait for enabled Post button → click → success when the dialog closes. Any structural mismatch returns `failed` with a readable reason; warnings return `fatal`.

## Why these choices

| Choice | Reason |
|---|---|
| WXT | Current MV3 tooling: typed entrypoints, HMR, zip, cross-browser later |
| Logic in `lib/` | Testable without a browser; the browser parts stay thin |
| Storage as single source of truth | Restart-safe worker, trivially reactive UI |
| Selectors isolated in `fb-dom.ts` | Facebook changes; one file to fix |
| Group list: paste, or opt-in import of the joined groups | The import reads only the user's own joined-groups page and shows a preview; the user picks what is added |
| `chrome.alarms` (not `setTimeout`) | Survives worker suspension |
| React + SCSS | Requested modern stack; SCSS/BEM per team convention |
