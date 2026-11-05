# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versioning: [SemVer](https://semver.org).

## [0.1.0] - 2026-11-05

### Changed
- Interface language is now Vietnamese (UI, run log messages, page `lang`). Facebook DOM text hints are unchanged.
- User guide: added install and update steps for internal (zip + Load unpacked) distribution.
- Facebook DOM hints: more Vietnamese phrases (composer, join, blocked, no permission) and NFC normalisation. Unverified on live Facebook.
- Content script retries the composer click up to 3 times if the post dialog does not open.
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
