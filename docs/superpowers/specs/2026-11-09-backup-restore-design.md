# Backup and restore (JSON) — design

## Intent
All CAP data lives only in `chrome.storage.local`. If the browser profile is reset or the user changes machine, groups, campaigns and history are lost. Add a local, offline export and import so the user can keep and move their data. This is roadmap item v0.4 "Backup and restore".

## Goals
- Export one JSON file containing: groups, campaigns (variations, groups, delay, Safety Break, schedule, mode, comments per group), settings and the activity log.
- Import a JSON file with a preview, then merge into existing data only after the user confirms.
- Everything runs on the device. No network call, no new permission, no new host.

## Non-goals
- Run state (`local:run`): never exported; restoring it could resume a run unexpectedly.
- Comment re-run protection data (`local:commentedPosts`) and `local:scheduleCheck`: technical state, not exported. Restoring them on another machine could hide new posts.
- Facebook cookies, tokens or any page data: never read, never stored.
- Encrypted backup, cloud sync, automatic backups, partial/selective export.

## Anti-goals
- An imported file must never start a run or enable automatic behaviour.
- A hand-edited or hostile file must never exceed `LIMITS` or corrupt existing data.

## Decisions (made with the project owner)
1. Export includes groups, campaigns, settings and activity log.
2. Import merges with a preview. It does not delete existing data.
3. **Schedules are switched off on import.** Every imported campaign gets `schedule.enabled = false` (times are kept). The preview and the result message tell the user how many schedules were turned off so they can re-enable them.

## Decisions (builder's call, to be checked)
- File format: `{ app: "connecttech-auto-poster", formatVersion: 1, exportedAt: <epoch ms>, appVersion: <manifest version>, data: { groups, campaigns, settings, logs } }`. File name `cap-backup-YYYY-MM-DD.json`.
- Merge rule: match by `id`. An id that already exists keeps the **current** item (no overwrite); other items are added. Counted as "new" vs "already present" in the preview.
- Groups are also deduplicated by canonical `url`, so a campaign's `groupIds` in the file are remapped to the existing group id when the URL already exists. Campaign `groupIds` that match no group after merge are dropped.
- Logs: merged by `id`, sorted by `ts`, trimmed to the existing 2000-entry cap (keep newest).
- Settings: the file's settings are applied only if the current settings are the defaults; otherwise the current settings win. Preview states this.
- Validation is a pure function `parseBackup(text)` that returns `{ ok: true, backup }` or `{ ok: false, error }` (Vietnamese message). It checks `app`, `formatVersion` (reject newer than supported), types of every field, and drops invalid items with a count rather than failing the whole file when possible. Campaign values pass through `clampDelay`/`LIMITS`; variations are capped by `maxVariations` and `maxPostLength`; groups per campaign by `maxGroupsPerCampaign`. File size limit 5 MB.
- Merge is a pure function `planImport(current, backup)` returning the preview counts and the merged data; a thin async function writes the result to storage.
- Import is refused while a run is `running`, `paused` or otherwise active, with a message to stop or finish the run first.
- UI: a new tab "Sao lưu" (Vietnamese UI). Export button; import via file picker (`<label>` + `input type=file accept=".json"`); preview panel; confirm and cancel buttons; result message. Uses existing components and BEM naming (`backup__...`), `rem` units, no inline styles, accessible labels.
- Export uses `Blob` + a temporary download link (same approach as CSV export in `src/lib/csv.ts`/ActivityView).

## Constraints
- `src/lib/*` logic must be pure and framework-free, each change with tests in `tests/`.
- Reuse `LIMITS` and `clampDelay`; do not duplicate limits.
- Update `CHANGELOG.md`, `docs/USER_GUIDE.md`, `docs/ARCHITECTURE.md` (new module), `docs/SAFETY_AND_PRIVACY.md` (backup contains post texts, group names and log; stays local; imported schedules are off), `docs/ROADMAP.md` (tick the item).
- Post texts and group names are in the file; the user must be told in the UI that the file is not encrypted.
- Do not run automated posting against real Facebook; unit tests only, plus an e2e step on the local mock if the UI flow is added to `e2e/smoke.py`.

## Left to the builder
Module and file names, exact Vietnamese wording, exact preview layout, test case list, whether to add an e2e step (recommended: export, clear data, import, check counts).
