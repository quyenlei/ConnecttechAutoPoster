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

## Open problem: comment campaigns find too few posts
- [ ] On live Facebook (one test group, 2026-11-09) only 1 of 8 recent posts could be identified, because Facebook does not put the post ID in the page until the pointer hovers the timestamp. Done: the log now says how many posts were seen versus identified (not yet checked live). Checked by the owner (2026-11-09): `m.facebook.com/groups/<id>` redirects to `facebook.com/groups/<id>`, so the mobile page is not an option. No hover faking.
- [x] Opt-in newest-posts mode: comment on up to 5 of the first feed posts without checking their age (mock-tested).
  - Live result from the owner (2026-11-09, two groups): in one group 1 comment was sent ("Đã gửi bình luận"); in the other, 0 of the first 8 feed items had a comment editor, so nothing was sent. **Not yet confirmed:** whether the sent comment landed on the right (newest) post, and whether `sorting_setting=CHRONOLOGICAL` works.
  - Console measurements (one group): feed items are plain `div` children of `[role="feed"]`; only the few items near the viewport had a comment editor; the others had no editor and no comment button yet; no link, no readable time (text inside the item is filler such as "Facebook").
- [ ] **Tomorrow:** (1) the owner checks whether the comment landed on the right post; (2) the owner checks what shows under the first posts of the group that sent nothing: an input box, or only a "Bình luận" button, and whether clicking it opens an inline editor or a pop-up window; (3) then choose: wait for items to render after a small scroll, or click the "Bình luận" button of items that have no editor. A click is a new automatic action on Facebook, so it must stay opt-in, visible in the UI and be documented in `docs/SAFETY_AND_PRIVACY.md`. The 24-hour rule and the other limits stay as they are.

## v0.3 content
- [x] Photo attachments for post campaigns (up to 4 images, stored locally, included in backups). Confirmed by the owner on live Facebook.
- [x] Bật/tắt xem trước link (close the link preview card before posting). Confirmed by the owner on live Facebook. Choosing the preview image or title is left for later.
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
