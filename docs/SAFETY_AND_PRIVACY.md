# Safety, Privacy and Compliance

## Compliance notice
Facebook has no public API for posting to groups, and automating the web interface can violate Facebook's Terms of Service and may lead to limits or suspension of your account. CAP reduces risk but cannot remove it. Use it only for groups you belong to, for content those groups allow, and never for spam. You are responsible for your use.

## Built-in safety (enforced in code)
| Rule | Where |
|---|---|
| Minimum 30 s between posts, max 3600 s; invalid ranges are corrected | `lib/delay.ts`, `lib/limits.ts` |
| Random wait within a range; first post immediate | `lib/run-engine.ts` |
| Recommended delay grows with group count; warnings for too-fast or fixed times | `lib/delay.ts` |
| Safety Break every N posts | `lib/run-engine.ts` |
| Auto-pause after 5 consecutive failures | `lib/run-engine.ts` |
| Halt on checkpoint / "temporarily blocked" / posting limited | `lib/fb-dom.ts`, content script |
| Skip groups you are not in or cannot post in | content script |
| Max 100 groups, 10 versions, 5000 characters | `lib/limits.ts`, background validation |
| Resume always waits a fresh delay | `run-engine.resume` |
| One run at a time | background |
| Group names: the **Lấy tên nhóm** button is opt-in and read-only (opens each unnamed group once in a background tab, one at a time, 3 s apart, never during a run, stops on a checkpoint). Names you typed are never overwritten. | background, `lib/fb-dom.ts` `readGroupName` |
| During a run, a group with no name also has its name read from the tab already opened for posting. No extra page load. | background |
| Daily schedule is opt-in (off by default), max 2 start times per campaign per day, at least 6 hours apart (also across midnight) | `lib/schedule.ts`, `lib/limits.ts`, campaign editor |
| A scheduled start is skipped, not queued, when a run is active; a slot missed by more than 10 minutes is never run late | background |
| All schedules switch off automatically when a run is halted (checkpoint / blocked); you must re-enable them | background |
| A failure that happened before anything was submitted (tab did not open, page did not load, composer not found, text not entered) is retried once, 8 s later, for post campaigns only. A failure that may have been submitted (for example "Facebook không xác nhận bài đăng") and every comment failure is never retried. A retry that also fails counts as one failure. | `lib/run-engine.ts` `applyOutcome`, `lib/limits.ts` `retryDelayMs` |
| A post that Facebook holds for admin approval is logged as `pending` ("Chờ duyệt"), not as a failure; it counts as sent. Detection looks for an approval notice that appears after pressing Post and is unverified on live Facebook. | `lib/fb-dom.ts` `detectPendingApproval` |
| **Chạy tiếp** only continues a run the user stopped. It waits a fresh random delay first and drops every queued group that already has a posted or pending log entry in that run, so a post sent while pressing Stop is not repeated. A halted run (checkpoint/block) cannot be continued; clear it and start again. Daily schedules always start a full run. | `lib/run-engine.ts` `continueRun`, background |
| Desktop notifications are opt-in (off by default, checkbox in **Tổng quan**). They are local, fire only when a run finishes, pauses by itself or is halted, and contain only the campaign name and counts. | `lib/notify.ts`, background |
| Comment campaigns use the same delay range, Safety Break, failure pause and halt rules as post campaigns; max 100 comments per group | `lib/run-engine.ts`, `lib/limits.ts` |
| Comments only go to posts CAP can identify (link and time) within the last 24 hours; if identity or age is unknown, nothing is sent | `lib/fb-dom.ts` `findRecentGroupPosts` |
| Newest-posts mode is opt-in per campaign, limited to 5 posts per group, never scrolls, and only uses the first 8 feed items that have exactly one comment editor. The post age is **not** checked in this mode, so a pinned or old post at the top can be commented. Mock-tested only | `lib/fb-dom.ts` `findNewestFeedPosts`, `lib/limits.ts`, background `commentOnNewestPost` |
| The post link and the run slot are saved before the comment editor opens, so a post is never commented twice and an uncertain submission is never retried automatically | background `commentInGroup` |
| A comment counts as sent only when a new visible comment appears and the editor is cleared | content script |

CAP deliberately has **no** features for evading detection (fingerprint spoofing, account rotation, proxies, humanized mouse emulation beyond a normal click, hidden posting). Do not add them.

## Privacy
- No backend, no analytics, no telemetry, no remote code, no third-party requests. The smoke test asserts the extension makes no external calls.
- Stored locally (`chrome.storage.local`): groups, campaigns, run state, activity log (max 2000 entries), settings (notification on/off). The Tổng quan page is computed from that log on this device.
- Comment campaigns keep attempted post links locally without automatic expiry run-slot identifiers for seven days, and, in newest-posts mode, a short hash of the author and the start of the post text (never the text itself, no automatic expiry) to avoid automatic retries after an uncertain submission.
- **Backup file (tab Sao lưu):** created only when you press export, saved by the browser to your own device. It contains post texts, group names and the activity log, and is not encrypted. CAP never uploads it. It never contains Facebook cookies, tokens, run state or comment re-run protection data.
- **Campaign images:** chosen from your own computer, shrunk on the device and stored in `chrome.storage.local` (limits: 4 images per campaign, 1 MB each, 4 MB in total). They are sent only to the Facebook composer when a post is made, and they are included in the backup file you export. They are never uploaded anywhere else, and their names, paths or data are never written to the activity log. No new permission or host was added. If the image input cannot be found, the post is not sent as text only.
- **`{group}` and link preview option:** both are opt-in per campaign, visible in the form, and only change what is typed or which preview card is closed in the normal composer.
- **Import safety:** a file never starts a run and never turns on automatic behaviour. Imported schedules are switched off. Values are clamped to the same hard limits as the UI (minimum delay 30 s, group, variation and length caps), and import is refused while a run is active. No permission or host was added for backup.
- CAP never reads, stores or transmits Facebook cookies, tokens or passwords. It uses the browser's existing logged-in session by opening normal tabs.
- Uninstalling the extension deletes all data.

## Permissions and why
| Permission | Reason |
|---|---|
| `storage` | Keep groups, campaigns, logs, run state on the device |
| `alarms` | Wake the service worker for the next post and for the next daily schedule time (`cap-schedule`). No new permission was added for the schedule. |
| `tabs` | Open the group page in a background tab, message it, close it |
| `notifications` | Show the opt-in desktop notification when a run finishes, pauses or is halted. Nothing is sent anywhere. |
| host `*://*.facebook.com/*` | Run the content script and open group pages |

Adding a permission requires updating this table and the changelog.

## Security notes
- Group links are validated: `https` only, exact Facebook hostnames (rejects `facebook.com.evil.com`).
- CSV export prefixes cells starting with `= + - @` to block spreadsheet formula injection.
- UI renders user text through React (escaped); no `dangerouslySetInnerHTML`, no `eval`, no inline scripts.
- Message handlers verify message shape before acting.
