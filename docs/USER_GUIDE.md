# User Guide

## Install (internal distribution)
CAP is shared as a zip file, for example `connecttech-auto-poster-0.2.0-chrome.zip`. It is not on the Chrome Web Store.

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

If you add a link without a name, the list shows the group id. Press **Lấy tên nhóm** to read the real names: CAP opens each unnamed group once in a background tab and reads its title. It never changes names you typed. Names are also filled in automatically the first time CAP posts to a group. Not verified on live Facebook, where the page title may differ; you can always type the name yourself with `URL | Name`.

## 2. Create a campaign
Open **Chiến dịch** (Campaigns) → **Tạo mới** (New).
1. **Name** it.
2. **Post text**: write version 1. **Add another version** to rotate texts so consecutive groups differ (version n is used for the n-th group, then repeats).
   - Write `{group}` where the group name should go, for example `Xin chào {group}!`. In the group "Dev Hà Nội" this is posted as `Xin chào Dev Hà Nội!`. Press **Chèn {group}** to add it at the cursor. Only `{group}` is replaced; any other `{...}` is posted as typed, and the form warns you. If CAP does not know the group name yet, it writes "bạn" instead. Use **Lấy tên nhóm** on the Groups tab to read the real names first.
   - **Ảnh đính kèm** (post campaigns only): choose up to 4 JPG, PNG or WebP images. Big images are shrunk on your computer to at most 1 MB each; all campaigns together may use 4 MB. Images stay in this browser and are only sent to Facebook when a post is made. If CAP cannot find the image input or the upload does not finish, that group is marked failed and **no text-only post is made**. (Confirmed by the owner on live Facebook.)
   - **Bỏ xem trước link khi đăng**: closes Facebook's link preview card before posting. Facebook may not show a card in every group; if there is none, the post goes out normally. (Confirmed by the owner on live Facebook.)
3. **Groups**: tick the groups (max 100). Type in the search box to filter by name. **Chọn tất cả** (Select all) and **Bỏ chọn** (Clear) act on the groups currently shown, so you can search first and select only those.
4. **Timing and safety**:
   - Wait range in seconds. Minimum 30. Press **Use recommended** for a suggestion based on group count.
   - A random range is safer than a fixed time. A warning appears for risky values.
   - **Safety Break**: pause for N minutes after every M posts (default every 10 posts, 15 min).
5. **Lưu chiến dịch** (Save campaign) or **Lưu và chạy** (Save and launch).

## 3. Run
The run bar is visible on every tab.
- The first post is sent immediately; waits apply between posts.
- **Lưu và chạy** asks you to confirm before it starts posting. Deleting a campaign, a group or the activity log also asks first. **Dừng** (Stop) never asks, so you can halt a run at once.
- **Tạm dừng** (Pause) stops the timer. **Tiếp tục** (Resume) waits a fresh random delay first. **Dừng** (Stop) ends the run.
- CAP opens each group in a background tab, posts, then closes it. Do not use that tab.
- **Chạy tiếp**: after you press **Dừng**, a button **Chạy tiếp N nhóm còn lại** appears. It asks first, waits a fresh random delay, and skips groups that already have a posted or pending entry in that run (for example a post that went out just as you pressed Stop). It does not appear after a checkpoint/block. **Lưu và chạy** always starts from the first group again.
- If a group fails before anything is sent (page did not load, composer not found), CAP tries the same group once more after 8 seconds; the log shows "Lỗi tạm thời, thử lại sau 8 giây". Failures that might have been submitted are never retried.
- If Facebook holds the post for admin approval, the log shows **Chờ duyệt**. This counts as sent. Detection is not verified on live Facebook, so a pending post may still appear as **Đã đăng**.
- The run stops by itself when: all groups are done, 5 groups fail in a row (paused), or Facebook shows a checkpoint / "temporarily blocked" message (halted). Resolve the problem on Facebook, wait, then **Xóa** (Clear) and start again.

### Bình luận bài viết trong nhóm
Trong trình soạn chiến dịch, chọn **Bình luận bài viết trong nhóm**, đặt số bài tối đa cho mỗi nhóm và nhập một hoặc nhiều phiên bản bình luận. Công cụ mở bảng tin với tham số `sorting_setting=RECENT_ACTIVITY`, chờ và cuộn tối đa bốn lần, rồi ưu tiên theo thời gian đăng trong số bài đã tải có liên kết và thời gian xác định được trong 24 giờ gần nhất. Thứ tự hoạt động gần đây không nhất thiết là thứ tự bài đăng mới nhất và Facebook có thể không áp dụng tham số này; đây không phải danh sách đầy đủ. Mỗi lượt bình luận áp dụng khoảng chờ và nghỉ an toàn như đăng bài. Các bài đã thử được ghi nhận trên thiết bị không tự hết hạn để tránh tự gửi lại, kể cả khi kết quả chưa rõ. Nếu không tìm thấy bài đủ điều kiện, lượt đó sẽ được bỏ qua và ghi số bài cùng số thẻ thời gian đọc được.

Chức năng này đã được kiểm thử trên mock cục bộ (gồm việc không bình luận lặp lại cùng một bài và bỏ qua nhóm không có bài phù hợp), nhưng chưa xác nhận hoạt động trên Facebook thật. Facebook có thể không cung cấp thời gian hoặc ô bình luận theo định dạng nhận diện được, khiến bài bị bỏ qua hoặc lượt chạy thất bại.
Thời gian tương đối như “16 phút” hoặc “2 giờ trước” được đọc khi gắn trực tiếp với liên kết bài; thời gian này là ước lượng vì Facebook làm tròn.
Công cụ cũng đọc ID, liên kết và thời gian tạo từ dữ liệu bài viết Facebook đưa vào trang, đối chiếu nhóm trước khi chọn bài.
Khi không còn bài chưa thử mà công cụ xác định được trong nhóm hiện tại, các lượt còn lại của nhóm đó được bỏ qua và chiến dịch tiếp tục quét nhóm kế tiếp ngay, trừ khi đến kỳ nghỉ an toàn. Khoảng chờ sau lượt bình luận vẫn được áp dụng. Facebook vẫn có thể có bài khác mà công cụ chưa nhận diện được ID.
**Chế độ “bài mới nhất” (tùy chọn, tự bật):** trên Facebook thật, nhiều bài mới không có liên kết, không có giờ đăng đọc được, nên công cụ không biết bài có trong 24 giờ hay không. Khi bạn tick **Bình luận các bài mới nhất, không cần biết giờ đăng**, công cụ mở nhóm theo thứ tự bài mới, và bình luận tối đa 5 bài đầu tiên của mỗi nhóm có ô bình luận riêng. Công cụ không cuộn và không kiểm tra giờ đăng, nên bài ghim hoặc bài cũ ở đầu nhóm vẫn có thể bị bình luận. Công cụ nhớ bài bằng một mã băm ngắn của tên tác giả và đoạn đầu nội dung (không lưu chữ gốc) để không bình luận lặp. Tính năng này mới được kiểm thử trên mock, **chưa kiểm tra trên Facebook thật**: hãy thử với một nhóm, số bài là 1, rồi xem bình luận có vào đúng bài không.
**Giới hạn đã biết (quan sát ngày 09/11/2026, một nhóm thử, chưa kiểm tra trên nhóm khác):** nhóm có 8 bài trong 24 giờ nhưng công cụ chỉ nhận diện được 1 bài. Trong trang Facebook, các bài mới chỉ có nhãn thời gian dạng chữ như “47 phút”. Nhãn này không nằm trong liên kết, và quanh bài không có liên kết hay ID bài. Facebook dường như chỉ điền liên kết bài khi người dùng di chuột vào dấu thời gian. Vì thiếu ID nên công cụ không mở được bài đó để bình luận và bỏ qua. Thông báo “Tìm thấy N bài” chỉ đếm các bài đã nhận diện được ID, không phải mọi bài trong nhóm. Cuộn thêm không khắc phục được. CAP không giả lập di chuột để ép Facebook hiện liên kết.
Nếu thấy thông báo đã phát hiện ô bình luận nhưng không xác định được bài viết và thời gian đăng, cấu trúc Facebook hiện tại chưa được hỗ trợ; công cụ không tự gửi bình luận trong trường hợp này.

### Daily schedule (Hẹn giờ chạy)
In the campaign editor, section **Thời gian và an toàn**, tick **Tự động chạy chiến dịch này mỗi ngày**, then **Thêm giờ**.
- Up to 2 times per day, at least 6 hours apart (including across midnight). Times use your computer's clock.
- The line **Lần chạy tiếp theo** shows the next start. Press **Lưu** to apply the schedule.
- Chrome must be open and logged in to Facebook. If a time passes while Chrome is closed or the computer sleeps, it is skipped when more than 10 minutes late ("Bỏ lỡ lịch HH:mm" in the log).
- If another run is active at that time, the scheduled start is skipped.
- If Facebook shows a checkpoint or block, all schedules turn off. Turn them back on after you resolve it on Facebook.
- Posting the same text twice a day can look like spam; add more versions.
- Automated tests use the local mock only. The owner confirmed by hand that the extension works on live Facebook.

## 4. Overview (tab Tổng quan)
Shows how many posts and comments were sent today and in the last 7 days (today plus the 6 days before), how many failed, and the success rate (sent ÷ sent + failed; skipped groups are not counted). Numbers come from the activity log, which keeps the latest 2000 entries, so clearing the log resets them.

The checkbox **Thông báo trên máy…** (off by default) shows a desktop notification when a run finishes, pauses by itself or is halted. It contains the campaign name and counts only. Chrome and your operating system must allow notifications.

## 5. Activity (tab Nhật ký)
Shows every attempt: **Đã đăng** (posted), **Chờ duyệt** (sent, waiting for admin approval), **Thất bại** (failed), **Đã bỏ qua** (skipped: not a member, cannot post, removed), **Nghỉ an toàn** (break), **Thông tin** (info). Filter by status and **Export CSV**.

## 6. Backup (tab Sao lưu)
- **Xuất bản sao lưu** saves groups, campaigns, settings and the activity log to `cap-backup-YYYY-MM-DD.json`. The file contains your post texts, group names and **campaign images** (so it can be a few MB) and is **not encrypted**, so keep it somewhere safe. Facebook data is never included.
- To restore, choose a file under **Nhập bản sao lưu**. A preview shows what will be added and what already exists. Press **Nhập dữ liệu** to confirm, or **Hủy**.
- Import only adds. Items that already exist are kept as they are; nothing is deleted or overwritten.
- **Schedules are switched off** on every imported campaign. Turn them on again in the campaign when you are ready.
- Import is refused while a run is active. Stop it or wait until it ends. Importing never starts a run.
- Invalid items in the file (for example a wrong group link or an image over the limits) are skipped, and the preview tells you how many images do not fit, and values are brought back within the safety limits.

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
