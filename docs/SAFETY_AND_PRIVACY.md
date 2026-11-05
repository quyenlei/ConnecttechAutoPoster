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

CAP deliberately has **no** features for evading detection (fingerprint spoofing, account rotation, proxies, humanized mouse emulation beyond a normal click, hidden posting). Do not add them.

## Privacy
- No backend, no analytics, no telemetry, no remote code, no third-party requests. The smoke test asserts the extension makes no external calls.
- Stored locally (`chrome.storage.local`): groups, campaigns, run state, activity log (max 2000 entries).
- CAP never reads, stores or transmits Facebook cookies, tokens or passwords. It uses the browser's existing logged-in session by opening normal tabs.
- Uninstalling the extension deletes all data.

## Permissions and why
| Permission | Reason |
|---|---|
| `storage` | Keep groups, campaigns, logs, run state on the device |
| `alarms` | Wake the service worker for the next post and for the next daily schedule time (`cap-schedule`). No new permission was added for the schedule. |
| `tabs` | Open the group page in a background tab, message it, close it |
| host `*://*.facebook.com/*` | Run the content script and open group pages |

Adding a permission requires updating this table and the changelog.

## Security notes
- Group links are validated: `https` only, exact Facebook hostnames (rejects `facebook.com.evil.com`).
- CSV export prefixes cells starting with `= + - @` to block spreadsheet formula injection.
- UI renders user text through React (escaped); no `dangerouslySetInnerHTML`, no `eval`, no inline scripts.
- Message handlers verify message shape before acting.
