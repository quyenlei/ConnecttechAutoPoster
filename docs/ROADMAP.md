# Roadmap

Priorities reflect risk first: safety and reliability before features.

## Done: v0.1 MVP
Groups, campaigns, safe run engine, activity log, CSV, tests, docs.

## Next: v0.2 reliability
- [ ] Verify the flow against live Facebook on a test account and fix selectors (English and Vietnamese UI).
- [ ] Detect "post is pending admin approval" and log it as `pending`.
- [ ] Retry once on temporary errors (after 8 s).
- [ ] Skip groups where the last attempt in this campaign already succeeded (resume after halt).
- [ ] Dashboard summary: posts today, 7-day success rate.
- [ ] Notifications (`notifications` permission) when a run finishes, pauses or halts.

## v0.3 content
- [ ] Photo attachments (file picker in the dialog).
- [ ] Link preview selection.
- [ ] Post templates with placeholders such as `{group}`.

## v0.4 data
- [ ] Backup and restore (JSON export/import with preview; never includes Facebook data).
- [ ] Group tags/folders and saved group lists.
- [x] Scheduled campaigns: fixed daily times (v0.2.0). Weekday or one-off dates are not planned yet.

## Later
- [ ] i18n (Vietnamese UI), keyboard shortcuts.
- [ ] Firefox build via WXT.
- [ ] Optional encrypted sync through the user's own storage (no Connecttech server).
- [ ] Chrome Web Store listing and privacy policy page.

## Explicitly out of scope
Detection evasion, multi-account rotation, posting to pages/profiles/Marketplace, scraping member lists, any remote license or tracking.
