# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versioning: [SemVer](https://semver.org).

## [Unreleased]

## [0.7.5] - 2026-11-11

### Added
- **One-click updates on Linux.** New `cap-updater-linux.zip` in every release: run `bash install.sh` in a terminal (no sudo). It installs CAP into `~/.local/share/ConnecttechAutoPoster/extension` and registers the updater with Google Chrome, and with Chromium when it is set up. Same helper protocol and checks as macOS (SHA-256, CAP releases on github.com only, acts only after **Cập nhật ngay**). CAP now offers this installer on Linux; ChromeOS and Android still get none. Snap and Flatpak Chromium cannot start native messaging hosts. `pnpm test:updater` now also runs on Linux in CI. Verified in an Ubuntu 24.04 container (mock test plus a real install of 0.7.4), not yet in a desktop Chrome on Linux.

## [0.7.4] - 2026-11-11

### Added
- **One-click updates on Windows and macOS** (owner decision). A small updater helper, installed once from the release (`cap-updater-windows.zip` → `install.bat`, `cap-updater-mac.zip` → `install.command`), registers with Chrome as native messaging host `com.connecttech.cap_updater` for the current user, allowed only for CAP. **Có bản mới** then shows **Cập nhật ngay**: after confirming, the helper downloads the zip named in `update.json` from the CAP releases on github.com, checks its SHA-256 and version, replaces CAP's folder, and CAP reloads itself. Data stays. Refused while a run is active. Without the helper CAP links its installer for the user's system and keeps the manual steps. New permission `nativeMessaging`; see SAFETY_AND_PRIVACY.
- The manifest has a `key`, so CAP's ID is now fixed (`ebembjpemaickbaogincmeajpgeabcbh`). **Moving to 0.7.4 changes the ID once, so CAP starts empty: export a backup in the old version first and import it in the new one.** Later updates keep the data.
- Releases attach both installers and write the zip's SHA-256 into `update.json`.
- Tests: `pnpm test:updater` runs the real installer and helper against a local mock (install, ping, update, refusals for wrong checksum, missing checksum, foreign URL, network); `.github/workflows/updater.yml` runs it on Windows and macOS, and on macOS also `e2e/updater_e2e.py`, which presses **Cập nhật ngay** in Chromium and checks that CAP comes back as the new version. The Windows helper is verified only in CI, not on a real user's PC yet.

## [0.7.3] - 2026-11-11

### Changed
- **The update check reads `update.json` first, so many people on one Wi-Fi no longer hit GitHub's limit.** GitHub's release API allows 60 requests an hour per IP address without login, and everyone behind the same network shares them (seen 2026-11-11: "API rate limit exceeded"). CAP now reads a small static file, `https://raw.githubusercontent.com/quyenlei/ConnecttechAutoPoster/update/update.json`, which GitHub serves from its CDN without that limit. The release API is asked only when that file cannot be read. Still one plain GET at most once a day plus **Kiểm tra cập nhật**, no cookies, only a version and github.com links kept; no permission was added. `raw.githubusercontent.com` is a new host for this request (owner decision, 2026-11-11).
- When the API is limited, the message now says so and when to try again ("GitHub đang giới hạn lượt kiểm tra từ mạng của bạn, thử lại sau 11:23.") instead of "GitHub trả về lỗi 403.".

### Added
- **Releases are automatic.** Pushing a tag `v<version>` runs `.github/workflows/release.yml`: install, typecheck, unit tests, then `scripts/release.mjs` builds the zip, creates the GitHub release with this CHANGELOG section, and only after that writes `update.json` on the `update` branch. The tag must match `package.json`. `node scripts/release.mjs --dry-run` shows the notes and `update.json` without publishing.

## [0.7.2] - 2026-11-11

### Changed
- Test release for the update check: same code as 0.7.1, only the version number changes. It was published from a commit outside the branches.

## [0.7.1] - 2026-11-11

### Changed
- **The update check now reads the releases of the public CAP repository `quyenlei/ConnecttechAutoPoster`** instead of the separate `quyenlei/ConnecttechAutoPoster-releases`, which was never created (owner decision: the source repository is now public). Same single GET of GitHub's latest-release API, at most once a day plus the button; no new permission or host. `pnpm release` publishes there too.

## [0.7.0] - 2026-11-11

### Changed
- **New Connecttech logo** (owner request, from `logo.png`): extension icons (`public/icon/16|32|48|128.png`, set as `icons` and `action.default_icon`), the notification icon, the dashboard header and the chat button and title on Facebook pages. `icon/48.png` is added to `web_accessible_resources` so the chat box on Facebook can show it; `chatbox.html` was already exposed there, so pages learn nothing new. The old `public/icon-128.png` is removed.
- **The default comment campaign "Bình luận nhanh" comes with 10 comments about Connecttech** (owner request) instead of empty text (`lib/defaults.ts` `DEFAULT_COMMENT_TEXTS`). Two use `{group}`; none has a phone number. The post campaign still starts empty. An existing "Bình luận nhanh" whose text is still empty gets the samples too: when the extension is updated or reloaded, and when **Tạo chiến dịch mặc định** is pressed (`fillDefaultComments`). Text the user wrote is never replaced, and other campaigns are not touched. Running it still needs the user to press **Chạy** and confirm.

### Fixed
- **New posts were skipped as "đã thử trước đó" when an older post had the same author and text** (seen live 2026-11-11 in a group where Facebook shows no post links). Without a link a post was known only by a fingerprint of author + text, so a repost shared the key of the old one and was never commented. The key now adds the minute of the hour the post was made (`feed:<group>:<fingerprint>@<minute>`), read from the post's own full-date label ("Thứ Tư, 11 Tháng 11, 2026 lúc 08:21"), a `time` element or Facebook's structured data, never from a comment. Only the minute is used because Facebook sometimes renders that date in another time zone, which shifts whole hours. When a post has a link, the link alone is its key. When neither a link nor the minute can be read, any stored key of the same fingerprint still counts as tried, as before. Keys saved by earlier versions (no minute) no longer block a post whose minute is known, so such a post can be tried once more; a post that already shows the user's comment is still skipped. The scan trace shows `fingerprint@minute`. Checked live, read-only, on the group where it was reported: a repost from 9 minutes ago and the original from 15 hours ago got different keys and were both picked; one real comment had been sent there earlier with the owner's confirmation.
- The smoke test finds dashboard tabs and campaign names by their label `span` again (the sidebar redesign had broken `button:text-is(...)`).
- Tried and dropped: hovering the time label to make Facebook show the post link. Live in that group neither synthetic events nor a real pointer move added the link (the label's `href` stays `?__cft__…`), so CAP does not hover for links.

## [0.6.8] - 2026-11-10

### Added
- **Update check.** Once a day (and with **Kiểm tra cập nhật** in tab Sao lưu) CAP asks GitHub for the latest release of the public releases repository `quyenlei/ConnecttechAutoPoster-releases`. When it is newer than the installed version, the dashboard and the chat box show **Có bản mới** with a download button and the install steps. Installing stays manual: Chrome does not let an unpacked extension replace its own files. This is the first request outside Facebook, an owner-approved exception to "no remote calls" (`CLAUDE.md` rule 3): a plain GET without cookies or user data that reads only a version and github.com links. No permission or host was added. `pnpm release` zips the build and publishes it as release `v<version>` there with its CHANGELOG notes. Checked against a local GitHub mock in the smoke test; the releases repository does not exist yet, so a real check currently reports "Chưa có bản phát hành nào".

## [0.6.7] - 2026-11-10

### Fixed
- "Uncaught Error: Extension context invalidated" from `content-scripts/chat.js`: after the extension was reloaded or updated, the chat box already on an open Facebook page was cut off from it and threw on every click. It now notices this (on a click, or by itself within 3 s) and turns into a note "Connecttech Auto Poster vừa được cập nhật. Tải lại trang để dùng tiếp." with **Tải lại trang** and **Ẩn**. A copy left by an older version is removed when the new one starts. Smoke-tested by reloading the extension with a Facebook page open.

## [0.6.6] - 2026-11-10

### Fixed
- **"Lưu và chạy" did nothing in the chat box on Facebook.** Every confirmation (start, continue, delete, discard changes, read joined groups) used the browser's `window.confirm`; inside the extension pages framed in a Facebook page that dialog can be blocked, which silently answers "no", so the buttons looked dead. They now use a dialog drawn by the page itself (`ui/confirm.tsx`, native `<dialog>`). While another run is active, a note next to "Lưu và chạy" explains why the button is disabled. The smoke test now fails if a native browser dialog appears. Mock-tested; the original failure was not reproduced on live Facebook, so the blocked dialog is the likely cause, not a confirmed one.

## [0.6.5] - 2026-11-10

### Added
- **Two default campaigns.** "Bình luận nhanh" (comments, 25 per group, 2–4 s apart, 10–20 s between groups, Safety Break off) and "Đăng bài vào nhóm" (posts, recommended delay, Safety Break on), both on every saved group (max 100) and with empty text, so neither can run until the user writes it. Added automatically on first install when there are no campaigns, and any time with **Tạo chiến dịch mặc định** in the Chiến dịch tab, which adds only the ones that are missing and never changes an existing campaign. `lib/defaults.ts`.

## [0.6.4] - 2026-11-10

### Changed
- **A run started from the chat box runs in that tab.** The Facebook tab where **Chạy** was pressed is navigated from group to group, for comment and post campaigns alike; no tab or window is opened and the tab is never closed (it stays on the last group). Pause, Stop and Continue keep using it. If the user closes it during the run, CAP falls back to opening its own tab. Runs started from the dashboard tab or by the daily schedule open their own tab as before. The confirmation says the tab will be used. Checked on the local mock (2 posts in the same tab, no tab opened); not yet seen on live Facebook.

## [0.6.3] - 2026-11-10

### Added
- **Chat box on Facebook.** A round button in the bottom-right corner of every facebook.com page opens a small Messenger-style window: run status with pause/resume/stop, the latest 40 log entries as messages (sent posts and comments on the right), and a campaign picker with a **Chạy** button. The title bar can minimise it to a bar, expand it to the full dashboard inside the same window, or close it. Open/minimised/expanded is remembered in `local:chatbox` and shared by all Facebook tabs. The window is a shadow root outside `<body>` that frames the extension's own `chatbox.html` / `options.html` (now web-accessible for facebook.com only); it loads only once opened. Display only: it reads nothing from the page and clicks nothing. No permission or host was added. Checked on the local mock (which sends a `frame-src` CSP like Facebook); not yet seen on live Facebook. Replaces the side panel briefly built in 0.6.2.

### Changed
- Smoke test: every wait between run steps is skipped by a test-only script in the test's extension pages (it moves the stored `nextAt` to now). The extension itself is unchanged. The Stop/Continue step still uses the real 30 s wait, and the daily schedule step still waits for the real clock minute.

## [0.6.1] - 2026-11-10

### Changed
- **Comment campaigns are much faster (owner's decision, 2026-11-10).** Unit tests and the local mock pass; **not verified on live Facebook at this speed.**
  - Own minimum wait between two comments: 2 s (`LIMITS.minCommentDelaySec`), default 2–4 s for new comment campaigns. Post campaigns keep 30 s. Existing comment campaigns keep the delay they were saved with. The editor warns when the wait is under 30 s.
  - New `Campaign.groupBreak`: the wait when the run moves on to another group, at least 10 s, default 10–20 s (also for campaigns saved without one). A group with no usable post is now left after this break instead of immediately. Safety Break is off by default for new comment campaigns and unchanged for existing ones.
  - The feed scan continues below the last post an earlier scan of the same page looked at, instead of reading the feed from the top for every comment.
  - Waits under 30 s are timed in the running service worker (Chrome alarms cannot fire sooner); the alarm remains as the backup after a worker restart.
  - Safety added with the speed: a comment campaign pauses after 2 failures in a row when the last one may have been sent but never showed up (was 5); a comment run halted by a checkpoint or block locks all comment runs for 24 hours (`local:commentLock`, never exported); comment limit wordings were added to the block detection (unverified on live Facebook).
  - Fixed: a group the user is not a member of, or whose feed cannot be read, was opened once per comment slot (and could auto-pause the run by itself); it is now left at once.

## [0.6.0] - 2026-11-10

### Changed
- **Comment campaigns find posts in a new way.** Mock-tested, plus one live check on 2026-11-10 that the owner asked for, on the owner's own test groups (2 members each) only: the scan logged in through the owner's browser session, read post times from Facebook's time labels ("9 phút trước", "4 ngày trước"), read the user's name from "Bình luận dưới tên …", scrolled through 6 posts, sent **one** real comment that landed on the chosen post, and a later scan skipped that post because it showed the user's comment. A full campaign run from the dashboard was then checked live on the owner's "Test 2" group: 7 of 7 comments sent in 197 s (30 s apart, one window, the feed loaded once), each on a different recent post, the post that already had the user's comment skipped, and no post commented twice (checked on the page afterwards). Not yet seen live: a hover that reveals a missing time (one post stayed without a time after the hover and was skipped), and a post that needs its "Bình luận" button clicked.
  - A comment run now uses one **visible** tab, opened as the active tab of the window the user is in (no new window), instead of hidden background tabs. Chrome hardly renders hidden tabs, so Facebook loaded no further feed posts there. The tab is reused for every comment in the same group (the feed is loaded and scanned once, not once per comment) and brought to the front again if the user switched away, moved to the next group by navigation, and closed when the run finishes, pauses, stops or halts; the tab the user was on is then shown again. No permission or host was added.
  - Both modes open the group sorted by new posts and walk the feed from the top: each post is brought into view (Facebook renders posts only near the viewport) and the page is scrolled to the end to load more (infinite scroll). Limits: 40 posts or 60 s per scan (`LIMITS.feedScanMaxPosts`, `feedScanTimeoutMs`); newest-posts mode looks at the first 10 posts (`LIMITS.newestFeedWindow`). Recent mode stops after 3 posts in a row older than 24 hours.
  - Post time is read from the label in the post header ("47 phút", "3 giờ", "Hôm qua lúc 20:31", English labels too), tooltip dates, `time` elements and Facebook's structured data. When none is readable, CAP sends one hover (pointer and mouse over/out events) to each of up to 4 likely time labels of that post, because Facebook shows the time and post link only under the pointer. Profile links are not hovered. Nothing is clicked and no movement path is simulated.
  - Already-commented posts are recognised on the page: a comment by the logged-in user (name read from "Bình luận dưới tên …"/"Comment as …") or a comment with one of the campaign texts. Local history still applies.
  - Comments are typed inline in the feed for both modes; the separate post page is no longer opened. A post without an editor gets its own "Bình luận" button clicked; if Facebook opens the post in a dialog, the comment goes there and the dialog is closed with Escape.
  - Post fingerprints now use the first text block of the post (outside comments, without "Xem thêm") instead of the longest text, which changed once comments loaded. Posts without a link commented with an older version may not be matched by history; the on-page check still skips them.
  - Logs say which post was chosen (with the time label it was read from), or how many posts were seen and why each was skipped.
  - Known limits seen live: posts by the same author with the same text share one fingerprint, so after one is commented the copies are skipped too. If Facebook's "Bài viết mới" order is not strictly by time, the scan stopping after 3 old posts in a row may miss a newer post further down (not observed yet).
  - Fixed after the live check: the absolute tooltip date in Facebook's first page load was in another time zone (US Pacific, 15 hours off from Vietnam), so a post made a minute earlier read as 15 hours old. A relative label ("2 phút trước", "khoảng 1 phút trước", "Vừa xong") now wins over an absolute date. Re-checked live on two groups.
  - Fixed after the live check: Facebook pads every post with hidden filler text (a blockquote of repeated "Facebook" and scrambled letters). It was read as the post text, so every post by one author got the same fingerprint and, after one comment, all of that author's posts were skipped. The text now comes from Facebook's `story_message` block, and filler is ignored. Re-checked live: two reads of the same post give the same fingerprint, and different posts by one author differ.
  - The scan reply carries a short trace (fingerprint, decision and time label per post, never post text) for debugging.
- Removed: the `RECENT_ACTIVITY` scan, the post-page comment flow and the `cap/discover-posts` / `cap/comment` messages.

### Added
- **Lấy danh sách nhóm đã tham gia** (tab Nhóm, opt-in): reads Facebook's "Tất cả các nhóm bạn đã tham gia" section on `facebook.com/groups/joins/` in an active tab of the current window, scrolling until the list stops growing (max 500 groups or 120 s, `LIMITS.maxJoinedGroups`, `joinedScanTimeoutMs`), then closes the tab and shows the user's previous tab again. Pending join requests and navigation links are left out. The result is only a preview (`local:joinedScan`): the user filters, ticks groups and adds them; groups already listed are marked and never changed. Read-only on Facebook: no clicks, no group is opened, no member data. No permission or host was added. Checked live on 2026-11-10 (owner's account): 144 of 144 groups read in 14 s, all named. A group stored by numeric id and the same group found by its named link cannot be matched as one.
- Comment campaigns: opt-in **newest-posts mode** for groups where Facebook shows no post link or readable time. It opens the group sorted by newest posts and comments on up to 5 of the first feed posts that have their own comment editor. The post age is not checked, so the 24-hour rule does not apply in this mode and a pinned or old post can be commented. Posts are remembered by a short hash of author and text start. Unit tests and the local mock pass; not verified on live Facebook.

### Changed
- Comment campaigns, newest-posts mode: the comment box is clicked and filled by paste or typed lines; feed forms have no send button, so the comment is sent with Enter (repeated only while text is still in the box); the send button search no longer mistakes the action-bar "Bình luận" button; a post whose comment was never sent (typing or send step failed before submit) is released instead of staying reserved; feed items still loading are scrolled into view (first 8 only) and waited for up to 12 s; the post fingerprint falls back to the first text block so posts by one author no longer share a fingerprint. Failure logs now list nearby buttons and per-item feed details. Unit tests pass; live Facebook: 2 of 3 groups sent in the owner's last run, Enter was ignored once.
- Comment campaigns: when no post can be used, the log now says how many posts were seen on the page versus how many were identified within 24 hours. Unit tests and typecheck pass; not yet checked on live Facebook.

### Fixed
- Dashboard views could show an outdated value: when a setting changed right after a view opened (for example ticking "Thông báo trên máy" at once), the first storage read could arrive later with the older value and overwrite the change on screen. `useItem` now ignores that first read once a change has arrived. Found while investigating an e2e failure; that failure itself was the test checking the box before React re-rendered, now fixed by waiting for it.
- `e2e/smoke.py` runs headless by default (new headless mode loads the extension and renders pages); set `E2E_HEADED=1` to watch it.

### Known limitations
- **Newest-posts mode, live result (2026-11-09, two groups): one comment sent, one group sent nothing because none of its first 8 feed items had a comment editor yet. Landing on the right post is not confirmed. Next steps are in `docs/ROADMAP.md`.**
- **(Addressed in Unreleased by the visible tab, scrolling and reading the post time; checked live on the owner's two test groups only.) Comment campaigns can miss most posts (observed on live Facebook, 2026-11-09, one test group, not yet fixed):** a group with 8 posts in the last 24 hours gave only 1 identifiable post. The owner measured the page in the browser console: the newer posts show only a text label such as "47 phút". That label is not inside a link, and the post has no link or long post ID anywhere in its DOM. Facebook seems to add the post link only when the pointer hovers the timestamp. Without an ID, CAP cannot open the post, so it skips it. Scrolling does not help. The log line "Tìm thấy N bài" counts only identified posts, not all posts. CAP will not fake hover events. The mobile group page (`m.facebook.com`) is not an option: the owner found it redirects to the desktop page. The owner also measured that newer feed items are plain `div` children of the feed with no `role="article"`, no link and no readable time, but they do have their own comment editor.

## [0.5.0] - 2026-11-09

Verification status: the owner tested these v0.3 features by hand on live Facebook and confirmed they work (templates, image attachments, link preview option, multi-line posts). Automated tests still use unit tests and the local mock only.

### Added
- **Post template `{group}`:** write `Xin chào {group}!` and each group gets its own name. Matching ignores case and spaces inside the braces. Other `{...}` text is posted as typed (the form shows a warning). If the group name is unknown, "bạn" is used so a bare `{group}` never reaches a post. Replaced in one place, the background, right before the post request; a post that becomes too long after replacing fails with a clear reason.
- **Image attachments** for post campaigns (not for comment campaigns): up to 4 images (JPG, PNG, WebP), 1 MB each after shrinking, 4 MB for all campaigns together. Large images are shrunk on your device. Images stay in `chrome.storage.local`. The content script adds them through the composer's file input and waits for the upload before pressing Post. If the input cannot be found, or the upload does not finish, the post fails and is **not** sent as text only.
- **Bỏ xem trước link khi đăng** (`removeLinkPreview`, off by default): after typing and attaching images, the content script waits once (4 s) for the link preview card and closes it. No card is not an error.
- Backups now include campaign images and `removeLinkPreview`. Import checks images against the same limits and counts what it leaves out.

### Fixed
- **Line breaks in posts:** on live Facebook a multi-line post (reported by the owner with screenshots) was posted as one block, because the whole text went in with a single `insertText` call. A first fix (type line by line, then clear and paste) posted the text **twice**, because clearing the box did nothing there. Now a multi-line text is pasted as plain text once (the paste kept the lines on live Facebook in the owner's screenshot); only if the box is still empty afterwards is it typed line by line. The box is never cleared and refilled. The post is **not** sent, and the group fails (retryable, nothing was submitted), when the box holds the text about twice ("bị lặp") or shows no line breaks ("không giữ được xuống dòng"). Verified on the local mock only, which has editors that keep lines only for a paste or lose them entirely; the owner later confirmed the paste-first flow by hand on live Facebook. Comments are unchanged.

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
