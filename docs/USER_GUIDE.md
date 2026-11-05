# User Guide

## Install (internal distribution)
CAP is shared as a zip file, for example `connecttech-auto-poster-0.1.0-chrome.zip`. It is not on the Chrome Web Store.

1. Unzip it into a folder you will keep, for example `~/connecttech-cap`. Do not move or delete this folder. Chrome reads the extension from it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder.
5. Pin CAP to the toolbar, then click its icon to open the app.

Chrome may show a "Disable developer mode extensions" prompt when it starts. This is normal for this install method. Dismiss it.

### Update to a new version
1. Unzip the new file over the same folder.
2. On `chrome://extensions`, click the reload icon (⟳) on the CAP card.

Your groups, campaigns and activity stay in place, because they are stored in the browser and the folder did not change. There is no automatic update. Each person must update by hand.

Each computer and each Chrome profile keeps its own data.

## Before you start
- Use Chrome, logged in to Facebook (same profile as the extension).
- You can only post to groups you have already joined.
- Keep the browser open during a run.

## 1. Add groups
Open **Nhóm** (Groups). Paste one link per line; add a name after `|` if you want:

```
https://www.facebook.com/groups/example | My group
https://www.facebook.com/groups/123456789
```

Only `https://facebook.com/groups/...` links are accepted (also `www.`, `m.`, `web.`). Duplicates are ignored. Lines that are not group links are listed back to you.

## 2. Create a campaign
Open **Chiến dịch** (Campaigns) → **Tạo mới** (New).
1. **Name** it.
2. **Post text**: write version 1. **Add another version** to rotate texts so consecutive groups differ (version n is used for the n-th group, then repeats).
3. **Groups**: tick the groups (max 100).
4. **Timing and safety**:
   - Wait range in seconds. Minimum 30. Press **Use recommended** for a suggestion based on group count.
   - A random range is safer than a fixed time. A warning appears for risky values.
   - **Safety Break**: pause for N minutes after every M posts (default every 10 posts, 15 min).
5. **Lưu chiến dịch** (Save campaign) or **Lưu và chạy** (Save and launch).

## 3. Run
The run bar is visible on every tab.
- The first post is sent immediately; waits apply between posts.
- **Tạm dừng** (Pause) stops the timer. **Tiếp tục** (Resume) waits a fresh random delay first. **Dừng** (Stop) ends the run.
- CAP opens each group in a background tab, posts, then closes it. Do not use that tab.
- The run stops by itself when: all groups are done, 5 groups fail in a row (paused), or Facebook shows a checkpoint / "temporarily blocked" message (halted). Resolve the problem on Facebook, wait, then **Xóa** (Clear) and start again.

## 4. Activity (tab Nhật ký)
Shows every attempt: **Đã đăng** (posted), **Thất bại** (failed), **Đã bỏ qua** (skipped: not a member, cannot post, removed), **Nghỉ an toàn** (break), **Thông tin** (info). Filter by status and **Export CSV**.

## Troubleshooting
| Message | Meaning / action |
|---|---|
| Không tìm thấy ô đăng bài. Có thể Facebook đã đổi giao diện. | Facebook changed its page. Update `src/lib/fb-dom.ts` (developers) or wait for an update. |
| Bạn chưa là thành viên của nhóm này. | Join the group first. |
| Bạn không thể đăng bài trong nhóm này. | Admins-only or restricted. Skipped. |
| Facebook không xác nhận bài đăng. | The dialog did not close in 20 s. Check the group manually; the post may or may not exist. |
| Trang nhóm tải quá lâu. | Network slow or not logged in. |
| 5 lần thất bại liên tiếp | Run paused. Check you are logged in and not rate limited. |

## Tips
- Start small (5–10 groups) and use the recommended delay.
- Do not post the same text to many groups; use several versions.
- Take breaks between campaigns.
