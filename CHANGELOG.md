# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versioning: [SemVer](https://semver.org).

## [Unreleased]

Verification status: everything below is tested with unit tests and the local mock only. None of it has been verified on live Facebook. In particular the image input, the "upload finished" check and the preview close button are guesses about Facebook's markup.

### Added
- **Post template `{group}`:** write `Xin chào {group}!` and each group gets its own name. Matching ignores case and spaces inside the braces. Other `{...}` text is posted as typed (the form shows a warning). If the group name is unknown, "bạn" is used so a bare `{group}` never reaches a post. Replaced in one place, the background, right before the post request; a post that becomes too long after replacing fails with a clear reason.
- **Image attachments** for post campaigns (not for comment campaigns): up to 4 images (JPG, PNG, WebP), 1 MB each after shrinking, 4 MB for all campaigns together. Large images are shrunk on your device. Images stay in `chrome.storage.local`. The content script adds them through the composer's file input and waits for the upload before pressing Post. If the input cannot be found, or the upload does not finish, the post fails and is **not** sent as text only.
- **Bỏ xem trước link khi đăng** (`removeLinkPreview`, off by default): after typing and attaching images, the content script waits once (4 s) for the link preview card and closes it. No card is not an error.
- Backups now include campaign images and `removeLinkPreview`. Import checks images against the same limits and counts what it leaves out.

### Fixed
- **Line breaks in posts:** on live Facebook a multi-line post (reported by the owner with screenshots) was posted as one block, because the whole text went in with a single `insertText` call. A first fix (type line by line, then clear and paste) posted the text **twice**, because clearing the box did nothing there. Now a multi-line text is pasted as plain text once (the paste kept the lines on live Facebook in the owner's screenshot); only if the box is still empty afterwards is it typed line by line. The box is never cleared and refilled. The post is **not** sent, and the group fails (retryable, nothing was submitted), when the box holds the text about twice ("bị lặp") or shows no line breaks ("không giữ được xuống dòng"). Verified on the local mock only, which has editors that keep lines only for a paste or lose them entirely; the paste-first flow is **unverified as a whole on live Facebook**. Comments are unchanged.

### Changed
- Backup file size limit raised from 5 MB to 8 MB so a full set of images fits.
- `LIMITS` gained `maxImagesPerCampaign`, `maxImageBytes`, `maxTotalImageBytes`, `maxImageEdgePx`, `imageUploadTimeoutMs` and `linkPreviewWaitMs`.
- No new permission or host.

## [0.4.0] - 2026-11-09

Patch versions 0.2.1–0.2.20 were build counters (each `pnpm build` increments the patch), not separate releases, so everything since 0.2.0 is listed here.

Note: `pnpm build` raises the patch number in `package.json` on every run. Reset it to the released version before committing.

### Verified
- The owner ran the extension by hand on live Facebook and confirmed it works. This was a manual check; individual items below marked "unverified" were not itemized in that check.

### Added
- **Sao lưu** tab: export groups, campaigns, settings and the activity log to a JSON file, and import it back with a preview. Import only adds (existing items are kept), switches every imported schedule off, clamps values to `LIMITS`, and is refused while a run is active. The file is not encrypted and holds post texts. Tested with unit tests and the local mock; not related to live Facebook.
- Posts held for admin approval are logged as `pending` ("Chờ duyệt") instead of a success. Detection is unverified on live Facebook.
- One automatic retry, 8 s later, for post campaigns when a failure happened before anything was submitted. Failures that may have been submitted, and all comment failures, are never retried.
- **Chạy tiếp** on a stopped run: waits a fresh delay and skips groups already posted in that run.
- Opt-in desktop notifications when a run finishes, pauses by itself or is halted (new `notifications` permission; off by default; see `docs/SAFETY_AND_PRIVACY.md`).
- **Tổng quan** tab: sent and failed counts for today and the last 7 days, plus the success rate, from the activity log.
- Comment campaigns for recent group posts with a configurable per-group limit and locally stored retry protection. Verified on the local mock (comment sent once, a re-run skips the already-attempted post, a group without a recent post is skipped); not yet verified on live Facebook.

### Changed
- `LIMITS` now also holds `maxLogEntries`, `maxSafetyBreakEvery` and `maxSafetyBreakMinutes`; the log cap and the campaign form use them instead of repeating the numbers.
- Docs brought in line with the code: README status and feature table, comment campaigns in the user guide, safety rules, architecture and roadmap; fixed `ppnpm` typos in the development guide.
- `pnpm test:e2e` now starts from a fresh browser profile, and the smoke test covers comment re-run protection and groups without an eligible post.
- Require a new visible comment as well as a cleared editor before reporting a comment as sent; uncertain submissions remain reserved.
- Read Facebook's structured group feed stories and their absolute creation times when timestamp links have deferred URLs.
- Advance immediately to the next group's scan when a group has no identifiable unattempted posts, while preserving the delay after submissions and safety breaks.
- When a comment scan finds no unattempted identifiable posts, advance to the next group instead of repeatedly scanning the same group.
- Resolve a deferred timestamp link from a unique post link in the same feed container, including comment links; ambiguous containers remain excluded.
- Recognize Facebook's Vietnamese “Đăng bình luận” button observed after entering a comment.
- Retain attempted post links without automatic expiry to prevent repeated comments; old run-slot markers expire after seven days.
- Distinguish posts already attempted from feeds where no qualifying post can be identified; clarify that time-tag counts do not include link timestamps.
- Find a single comment editor without requiring an article and look for its form's send button after entering text. Unverified on live Facebook.
- Recognize group post links using a single `multi_permalinks` parameter when a readable timestamp is available.
- Recognize recent relative timestamps on group post links when Facebook has not rendered the absolute-date tooltip.
- Recognize Vietnamese absolute dates referenced by group post links in Facebook's saved DOM.
- Open group feeds with `sorting_setting=RECENT_ACTIVITY` when discovering posts for comment campaigns; Facebook's response to this setting has not been verified live.
- Detect comment editors in Facebook's saved Lexical markup and report an unsupported feed as a failure when post identity and age cannot be established. Sending remains unverified.
- Comment discovery waits for the feed and scans additional loaded content, then prioritizes identifiable posts by timestamp. It reports how many articles and machine-readable timestamps it saw when no eligible post is found.

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
