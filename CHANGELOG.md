# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versioning: [SemVer](https://semver.org).

## [0.2.0] - 2026-11-05

### Added
- Daily schedule per campaign (opt-in, off by default): up to 2 local start times, at least 6 hours apart, using the existing `alarms` permission. Only verified on the local mock, not on live Facebook.
- A scheduled start is skipped when a run is active, and slots missed by more than 10 minutes are logged and not run late.
- All schedules switch off automatically when a run is halted by a checkpoint or block.
- New limits in `lib/limits.ts`: `maxScheduleTimesPerDay`, `minScheduleGapMinutes`, `scheduleGraceMinutes`.

- UI refresh: brand blue `#0148b9`, light and dark themes via CSS tokens (contrast checked at 4.5:1 or better), card shadows, pill tabs, badges with soft backgrounds, hover/focus/disabled states, skip link and per-tab page title. System fonts only, no remote assets.
- Vietnamese run-status badges (Đang chạy, Tạm dừng, Hoàn tất...), popup button text, and "Xóa kết quả" label for clearing a finished run.
- Confirmation before launching a run and before deleting a campaign, a group or the activity log. Stop stays instant. Warning when switching campaigns with unsaved changes.
- Number fields can be cleared while typing; values are clamped on save. Activity table shows the latest 100 rows with "Xem thêm".
- Campaign group picker: search by name, **Chọn tất cả** / **Bỏ chọn** (apply to the filtered list when a search is active), and a notice at the 100-group cap.
- **Lấy tên nhóm** button on the groups tab and automatic name reading while posting, so groups show their real name instead of the id. Names you typed are never overwritten. Only verified on the local mock.

### Changed
- "Maximum groups per campaign" validation message is now in Vietnamese.
- Start logic is shared between the Start button and the schedule (`startRun`).

## [0.1.0] - 2026-11-05

### Changed
- Interface language is now Vietnamese (UI, run log messages, page `lang`). Facebook DOM text hints are unchanged.
- User guide: added install and update steps for internal (zip + Load unpacked) distribution.
- Facebook DOM hints: more Vietnamese phrases (composer, join, blocked, no permission) and NFC normalisation. Unverified on live Facebook.
- Content script retries the composer click up to 3 times if the post dialog does not open.
- "Facebook không xác nhận bài đăng" now adds a short dialog summary (count, Post button state, UI heading) to help diagnose it; post text is never included.
- Post is now treated as submitted when the dialog closes or its textbox is emptied, and waits up to 30 s (was 20 s); overall post timeout raised to 90 s. Fixes false "not confirmed" failures on two groups where the post had actually been published.
- Package manager is pnpm (`pnpm-lock.yaml`, `packageManager` field); `package-lock.json` removed.

### Added
- WXT + TypeScript + React 19 + SCSS extension scaffold (Manifest V3).
- Groups: bulk add from links, validation, removal.
- Campaigns: save/edit/delete, post versions, group selection, delay range, Safety Break.
- Run engine: pure, tested state machine (first post immediate, random waits, Safety Break, auto-pause after 5 failures, halt on fatal).
- Background runner using `chrome.alarms`, restart-safe.
- Content script that drives the visible Facebook composer (English + Vietnamese hints).
- Activity log with filter and CSV export.
- 26 unit tests and a Playwright smoke test against a local mock page.
- Documentation set and AI contributor rules.
