# Safety, Privacy and Compliance

## Compliance notice
Facebook has no public API for posting to groups, and automating the web interface can violate Facebook's Terms of Service and may lead to limits or suspension of your account. CAP reduces risk but cannot remove it. Use it only for groups you belong to, for content those groups allow, and never for spam. You are responsible for your use.

## Built-in safety (enforced in code)
| Rule | Where |
|---|---|
| Minimum 30 s between posts, max 3600 s; invalid ranges are corrected | `lib/delay.ts`, `lib/limits.ts` |
| Comment campaigns have their own minimum: 2 s between two comments (default 2–4 s), max 3600 s, and a break of at least 10 s (default 10–20 s) when the run moves on to another group. This is the owner's decision of 2026-11-10 to match commenting by hand; it is much faster than the post minimum and Facebook may treat it as spam. The editor shows a warning whenever the wait is under 30 s. Not verified on live Facebook at this speed. | `lib/delay.ts` `minDelayFor`, `clampGroupBreak`, `lib/limits.ts`, `lib/run-engine.ts` |
| A comment campaign pauses after 2 failures in a row when the last one may have been sent but never showed up on the page (a possible silent limit). Failures where nothing was sent keep the limit of 5. | `lib/run-engine.ts` `applyOutcome`, `lib/limits.ts` `maxUnconfirmedComments` |
| When a comment run is halted (checkpoint / blocked), comment runs cannot be started or continued for 24 hours; the log and the start error show when the lock ends. Post campaigns are not locked. The lock is stored locally (`local:commentLock`) and never exported. | background `commentLockProblem`, `lib/run-engine.ts` `commentLockUntil` |
| A wait shorter than 30 s is timed inside the running service worker, because Chrome does not fire alarms sooner; the alarm is still set as the restart-safe backup, and a step called before its time does nothing. | background `schedule`, `runStep` |
| Random wait within a range; first post immediate | `lib/run-engine.ts` |
| Recommended delay grows with group count; warnings for too-fast or fixed times | `lib/delay.ts` |
| Safety Break every N posts | `lib/run-engine.ts` |
| Auto-pause after 5 consecutive failures | `lib/run-engine.ts` |
| Halt on checkpoint / "temporarily blocked" / posting limited / commenting limited (the comment wordings are unverified on live Facebook) | `lib/fb-dom.ts`, content script |
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
| Comment campaigns use the same Safety Break (off by default for new comment campaigns, which rest between groups instead) and halt rules as post campaigns; max 100 comments per group. A group you are not a member of, or whose feed cannot be read, is left at once instead of being opened once per comment. | `lib/run-engine.ts`, `lib/limits.ts` |
| Comments go only to posts whose time is read as within the last 24 hours, or, in the opt-in newest-posts mode, to the first 10 feed posts (max 5 per group) where a post known to be older than 24 hours is still skipped. Posts already showing your comment or a campaign text are skipped | `lib/comment-pick.ts` `judgeFeedPost`, `lib/fb-dom.ts` `readFeedPost` |
| Comment runs use one visible tab in the user's current window (no hidden or background posting), reused within a group and closed when the run finishes, pauses, stops or halts; the user's previous tab is then shown again. A scan looks at most 40 posts or 60 s and continues below the last post an earlier scan of the same page looked at; scrolling only loads the group's own feed | background `openGroupFeed`, `lib/limits.ts` |
| When a post's time is not readable, CAP hovers up to 4 likely time labels of that post once (pointer/mouse over and out events on one element), because Facebook shows the time only under the pointer. No clicks, no random or simulated movement paths, profile links excluded. Mock-tested only | content script `revealTime`, `lib/fb-dom.ts` `findTimestampTargets`, `hoverOver` |
| A post without a comment editor gets its own "Bình luận" button clicked once to open one; nothing else on the page is clicked | content script `commentOnPickedPost` |
| **Lấy danh sách nhóm đã tham gia** is opt-in (button + confirmation), never runs during a run or while names are being read, and only reads the "groups you joined" section of `facebook.com/groups/joins/` in an active tab of the current window that closes afterwards (max 500 groups, 120 s). No clicks, no group page is opened, no member data. Nothing is added until the user ticks groups | background `fetchJoinedGroups`, `lib/fb-dom.ts` `findJoinedGroupsSection`, `readJoinedGroups` |
| A run started from the chat box uses the Facebook tab it was started in (navigated from group to group, never closed); no tab is opened unless that tab is closed during the run. Runs from the dashboard tab or the schedule open their own tab. | background `startRun`, `ownRunTab`, `openGroupFeed` |
| The post link and the run slot are saved before the comment editor opens, so a post is never commented twice and an uncertain submission is never retried automatically | background `commentInGroup` |
| A comment counts as sent only when a new visible comment appears and the editor is cleared | content script |

CAP deliberately has **no** features for evading detection (fingerprint spoofing, account rotation, proxies, humanized mouse emulation such as random movement paths or fake idle movement, hidden posting). The single hover on a post's time label exists only to read the time and is not meant to look human. Do not add evasion features.

## Privacy
- No backend, no analytics, no telemetry, no remote code. The only request outside Facebook is the **update check** (owner's decision, 2026-11-10): a plain GET of `https://api.github.com/repos/quyenlei/ConnecttechAutoPoster-releases/releases/latest`, at most once a day and when you press **Kiểm tra cập nhật**. It sends no cookies and no data about you, your groups or campaigns (GitHub sees the request's IP address and browser, like any web request). It only reads the version number and github.com links; nothing is downloaded or installed automatically. No permission or host was added for it (GitHub's API allows it). In the smoke test, GitHub is answered by the local mock; every other host is blocked.
- `local:update` holds the result of the last update check (time, latest version, its GitHub links, the last error). It is never exported.
- Stored locally (`chrome.storage.local`): groups, campaigns, run state, activity log (max 2000 entries), settings (notification on/off). The Tổng quan page is computed from that log on this device.
- `local:chatbox` holds only whether the chat box on Facebook pages is open, minimised or expanded; it is never exported.
- `local:joinedScan` holds the last joined-groups preview (group ids and names as Facebook shows them) until the next scan; it is never exported and is deleted with the extension.
- `local:commentTab` holds only the ids of the open comment tab, its window, the tab to return to and the group while a comment run uses it; it is cleared when the tab closes and never exported.
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
| Content script on `*://*.facebook.com/*` (chat box) | Shows the CAP chat button and window on Facebook pages. Display only: reads nothing from the page and clicks nothing. Covered by the existing `*://*.facebook.com/*` host permission. |
| `web_accessible_resources: chatbox.html, options.html` (facebook.com only) | Lets the chat box and the full dashboard load inside the chat window on Facebook pages. |
| `tabs` | Open the group page in a background tab (posts) or as the visible tab of the current window (comments, joined groups), message it, close it, and re-activate the user's previous tab. |
| `notifications` | Show the opt-in desktop notification when a run finishes, pauses or is halted. Nothing is sent anywhere. |
| host `*://*.facebook.com/*` | Run the content script and open group pages |

Adding a permission requires updating this table and the changelog.

## Security notes
- Group links are validated: `https` only, exact Facebook hostnames (rejects `facebook.com.evil.com`).
- CSV export prefixes cells starting with `= + - @` to block spreadsheet formula injection.
- UI renders user text through React (escaped); no `dangerouslySetInnerHTML`, no `eval`, no inline scripts.
- Message handlers verify message shape before acting.
