# Roadmap

Priorities reflect risk first: safety and reliability before features.

## Done: v0.1 MVP
Groups, campaigns, safe run engine, activity log, CSV, tests, docs.

## Done since v0.1
- [x] Vietnamese UI (v0.1.0).
- [x] Daily schedule, group-name reading, confirmations, UI refresh (v0.2.0).
- [x] Comment campaigns on recent group posts. Verified on the local mock only, not on live Facebook.

## Next: v0.2 reliability
- [x] Verify the flow against live Facebook: the owner ran it by hand and confirmed it works. Which UI languages and features were covered is not recorded; keep re-checking when Facebook changes.
- [x] Detect "post is pending admin approval" and log it as `pending` (mock only; hints unverified on live Facebook).
- [x] Retry once on temporary errors (after 8 s), only when nothing was submitted.
- [x] Continue a stopped run, skipping groups already posted (**Chạy tiếp**). A halted run is deliberately not continuable.
- [x] Dashboard summary: posts today, 7-day success rate (tab Tổng quan).
- [x] Notifications (`notifications` permission, opt-in) when a run finishes, pauses or halts.

## v0.3 content
- [x] Photo attachments for post campaigns (up to 4 images, stored locally, included in backups). Local mock only; the image input and upload check are unverified on live Facebook.
- [x] Bật/tắt xem trước link (close the link preview card before posting). Local mock only; unverified on live Facebook. Choosing the preview image or title is left for later.
- [x] Post template placeholder `{group}`. Other placeholders (such as `{date}`) are not planned yet.

## v0.4 data
- [x] Backup and restore (JSON export/import with preview; never includes Facebook data). Tested with unit tests and the local mock only.
- [ ] Group tags/folders and saved group lists.
- [x] Scheduled campaigns: fixed daily times (v0.2.0). Weekday or one-off dates are not planned yet.

## Later
- [ ] Keyboard shortcuts.
- [ ] Firefox build via WXT.
- [ ] Optional encrypted sync through the user's own storage (no Connecttech server).
- [ ] Chrome Web Store listing and privacy policy page.

## Explicitly out of scope
Detection evasion, multi-account rotation, posting to pages/profiles/Marketplace, scraping member lists, any remote license or tracking.
