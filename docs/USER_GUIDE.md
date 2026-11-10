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
CAP checks GitHub for a newer version once a day (tab **Sao lưu** → **Kiểm tra cập nhật** checks at once). When there is one, the dashboard and the chat box show **Có bản mới** with a download button. Chrome does not let an extension installed this way replace itself, so installing stays manual:

1. Download the zip and unzip it over the same folder.
2. On `chrome://extensions`, click the reload icon (⟳) on the CAP card.
3. Reload your open Facebook tabs.

Your groups, campaigns and activity stay in place, because they are stored in the browser and the folder did not change.

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
**Chiến dịch mặc định:** bấm **Tạo chiến dịch mặc định** trong tab Chiến dịch để có sẵn hai chiến dịch trên tất cả nhóm đã lưu: **Bình luận nhanh** (25 bài mỗi nhóm, cách nhau 2–4 giây, nghỉ 10–20 giây khi chuyển nhóm) và **Đăng bài vào nhóm** (khoảng chờ khuyến nghị, có nghỉ an toàn). Nội dung để trống: hãy viết nội dung, bỏ bớt nhóm nếu cần, rồi lưu trước khi chạy. Nút chỉ thêm chiến dịch còn thiếu, không sửa chiến dịch bạn đã có. Lần cài đặt đầu tiên, hai chiến dịch này được tạo sẵn.
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

### Safe Mode cho chiến dịch bình luận

Chọn loại **Bình luận bài viết trong nhóm**, bật **Safe Mode — chỉ lấy bài, không bình luận**, chọn nhóm và số bài tối đa, rồi lưu và chạy. Không cần nhập nội dung bình luận. Tool vẫn dùng điều kiện chọn bài của chiến dịch, nhưng chỉ lưu kết quả trên thiết bị, không gửi bình luận và không đánh dấu bài là đã bình luận. Danh sách kết quả hiện trong chiến dịch, kèm nội dung đọc được và liên kết khi Facebook cung cấp. Mỗi lượt Safe Mode mới thay thế danh sách trước; danh sách này không nằm trong bản sao lưu. Cấu hình Safe Mode của chiến dịch được sao lưu.

## 3. Run

**Hộp chat trên Facebook:** trên mọi trang Facebook có một nút tròn màu xanh ở góc dưới bên phải. Bấm vào để mở hộp chat Auto Poster: trạng thái lượt chạy (Tạm dừng / Tiếp tục / Dừng), các hoạt động mới nhất hiện như tin nhắn, và ô chọn chiến dịch với nút **Chạy**. Trên thanh tiêu đề: nút mũi tên mở rộng để xem cài đặt đầy đủ ngay trong hộp, nút gạch ngang để thu nhỏ, nút X để đóng. Trạng thái mở/thu nhỏ được nhớ ở mọi tab Facebook.
The run bar is visible on every tab.
- The first post is sent immediately; waits apply between posts.
- **Lưu và chạy** asks you to confirm before it starts posting. Deleting a campaign, a group or the activity log also asks first. **Dừng** (Stop) never asks, so you can halt a run at once.
- **Tạm dừng** (Pause) stops the timer. **Tiếp tục** (Resume) waits a fresh random delay first. **Dừng** (Stop) ends the run.
- **Chạy từ hộp chat:** CAP chạy ngay trên tab Facebook bạn đang đứng. Tab tự chuyển qua từng nhóm để đăng bài hoặc bình luận, không mở tab mới và không đóng khi xong. Đừng bấm vào trang trong lúc đang chạy.
- Chạy từ bảng điều khiển (tab riêng) hoặc theo lịch: CAP tự mở tab cho từng nhóm (đăng bài: tab nền, đóng sau khi đăng; bình luận: một tab hiển thị).
- **Chạy tiếp**: after you press **Dừng**, a button **Chạy tiếp N nhóm còn lại** appears. It asks first, waits a fresh random delay, and skips groups that already have a posted or pending entry in that run (for example a post that went out just as you pressed Stop). It does not appear after a checkpoint/block. **Lưu và chạy** always starts from the first group again.
- If a group fails before anything is sent (page did not load, composer not found), CAP tries the same group once more after 8 seconds; the log shows "Lỗi tạm thời, thử lại sau 8 giây". Failures that might have been submitted are never retried.
- If Facebook holds the post for admin approval, the log shows **Chờ duyệt**. This counts as sent. Detection is not verified on live Facebook, so a pending post may still appear as **Đã đăng**.
- The run stops by itself when: all groups are done, 5 groups fail in a row (paused), or Facebook shows a checkpoint / "temporarily blocked" message (halted). Resolve the problem on Facebook, wait, then **Xóa** (Clear) and start again.

### Lấy danh sách nhóm đã tham gia
Trong tab **Nhóm**, bấm **Lấy danh sách nhóm đã tham gia** và xác nhận. CAP mở trang “Nhóm bạn đã tham gia” của Facebook thành một tab trong cửa sổ bạn đang dùng, cuộn tới hết danh sách, rồi đóng tab và quay về tab cũ (tối đa 500 nhóm hoặc 2 phút). Chỉ mục “Tất cả các nhóm bạn đã tham gia” được đọc: nhóm đang chờ duyệt không được lấy, không mở nhóm nào, không bấm gì, không đọc thành viên.

Kết quả hiện thành danh sách xem trước. Nhóm đã có ghi “Đã có”. Lọc theo tên, tick nhóm muốn dùng (hoặc **Chọn tất cả nhóm mới đang hiện**) rồi bấm **Thêm N nhóm đã chọn**. Danh sách không cho biết nhóm nào cho phép đăng hoặc bình luận, nên hãy chọn lọc; mỗi chiến dịch vẫn tối đa 100 nhóm. Một nhóm đã lưu bằng ID số có thể hiện thêm lần nữa nếu Facebook ghi nó bằng tên riêng.

Đã kiểm tra trên Facebook thật một lần (10/11/2026): đọc đủ 144/144 nhóm trong 14 giây.

### Bình luận bài viết trong nhóm
Trong trình soạn chiến dịch, chọn **Bình luận bài viết trong nhóm**, đặt số bài tối đa cho mỗi nhóm và nhập một hoặc nhiều phiên bản bình luận.

**Cách công cụ tìm bài:**
- Khi chạy, CAP mở nhóm (sắp xếp theo bài mới, `sorting_setting=CHRONOLOGICAL`) thành **một tab đang hiển thị trong cửa sổ Chrome bạn đang dùng**, không mở cửa sổ mới. Chrome gần như ngừng vẽ tab ẩn, và khi đó Facebook không tải thêm bài, nên tab này phải là tab đang xem: nếu bạn chuyển sang tab khác, CAP đưa nó lên lại ở lượt tiếp theo. Đừng thu nhỏ cửa sổ. Nếu tab bị ẩn, nhật ký sẽ nhắc.
- CAP đi từ bài đầu feed xuống: đưa từng bài vào giữa màn hình (Facebook chỉ vẽ bài gần màn hình), đọc bài, và cuộn xuống cuối khi hết bài đã tải để Facebook tải thêm. Tối đa 40 bài hoặc 60 giây mỗi lần quét.
- Giờ đăng được đọc từ nhãn như “47 phút”, “3 giờ”, “Hôm qua lúc 20:31”, từ tooltip ngày giờ, hoặc từ dữ liệu bài Facebook đưa vào trang. Nếu không đọc được, CAP **rê chuột (một sự kiện hover) vào nhãn giờ đăng** của bài, vì Facebook chỉ hiện giờ và liên kết bài khi con trỏ nằm trên đó, rồi rời đi. Không click, không di chuột theo đường đi giả lập.
- Bài bị bỏ qua khi: đã thử trước đó (theo liên kết bài hoặc mã băm), **đã có bình luận của bạn** (nhận ra tên bạn từ dòng “Bình luận dưới tên …” hoặc thấy đúng nội dung bình luận của chiến dịch), cũ hơn 24 giờ, không rõ giờ đăng, hoặc không có cách bình luận. Khi gặp 3 bài cũ hơn 24 giờ liên tiếp, CAP dừng cuộn.
- Bài chưa hiện ô bình luận: CAP bấm nút **Bình luận** của chính bài đó để mở ô. Nếu Facebook mở bài trong hộp thoại, CAP bình luận trong hộp thoại rồi đóng nó bằng phím Esc.
- Bình luận được gõ ngay trong feed, không mở trang bài viết riêng. Bài và lượt chạy được ghi nhận **trước khi** gõ, nên một lần gửi chưa rõ kết quả sẽ không bao giờ tự gửi lại.
- Lượt bình luận tiếp theo trong cùng nhóm dùng lại tab đã tải, không tải lại nhóm. Sang nhóm khác, tab chuyển trang. Tab tự đóng và quay về tab bạn đang xem trước đó khi chạy xong, tạm dừng, dừng hoặc bị chặn.
- **Tốc độ:** chiến dịch bình luận có khoảng chờ riêng, tối thiểu 2 giây giữa hai bình luận (mặc định 2–4 giây) và nghỉ ít nhất 10 giây khi chuyển sang nhóm khác (mặc định 10–20 giây). Tốc độ này ngang với bình luận bằng tay và dễ bị Facebook coi là spam; màn hình chiến dịch hiện cảnh báo khi khoảng chờ dưới 30 giây. Nghỉ an toàn theo số lượt vẫn có, nhưng tắt sẵn ở chiến dịch bình luận mới.
- **Quét một lần:** lượt bình luận kế tiếp trong cùng nhóm quét tiếp từ bài ngay dưới bài vừa xem, không đọc lại feed từ đầu.
- **Khi Facebook cảnh báo:** CAP dừng hẳn, tắt mọi lịch chạy và khóa chiến dịch bình luận 24 giờ (nhật ký ghi giờ mở lại). Hãy mở Facebook, đọc cảnh báo, tự hoàn thành bước kiểm tra nếu có, và không bình luận thêm trong thời gian bị hạn chế. Nếu 2 bình luận liên tiếp được gửi mà không hiện lên trang, CAP tự tạm dừng để bạn kiểm tra.
- Nhóm bạn chưa tham gia hoặc không đọc được feed sẽ bị bỏ qua cả nhóm ngay. Nhật ký ghi bài được chọn (“Chọn bài thứ 2 trong feed, đăng khoảng 10 phút trước”) hoặc lý do không chọn được bài nào (“Đã xem 12 bài: 3 đã thử trước đó, 1 bạn đã bình luận, 8 cũ hơn 24 giờ”). Khi một nhóm không còn bài phù hợp, các lượt còn lại của nhóm đó được bỏ qua ngay.

**Chế độ “bài mới nhất” (tùy chọn):** tick **Bình luận các bài mới nhất, không cần biết giờ đăng** khi Facebook không cho đọc giờ đăng. CAP chỉ xét 10 bài đầu feed, tối đa 5 bình luận mỗi nhóm, và chấp nhận bài không rõ giờ. Bài đọc được giờ mà cũ hơn 24 giờ vẫn bị bỏ qua, nhưng bài ghim không rõ giờ có thể bị bình luận.

**Trạng thái kiểm thử:** đã kiểm thử trên mock cục bộ, và kiểm tra một lần trên Facebook thật (10/11/2026, nhóm thử của chủ dự án): đọc được giờ đăng, nhận ra bình luận của bạn, cuộn qua 6 bài, gửi đúng 1 bình luận vào bài được chọn; chạy cả chiến dịch 7 bình luận từ bảng điều khiển: 7/7 bài khác nhau, không bài nào bị bình luận 2 lần. **Chưa kiểm tra trên Facebook thật:** hover để hiện giờ đăng, và bấm nút Bình luận để mở ô. Lưu ý: các bài cùng tác giả và cùng nội dung được coi là một bài, nên sau khi bình luận một bài thì các bản trùng cũng bị bỏ qua. Facebook có thể dùng nhãn, cấu trúc hoặc hành vi hover khác. Hãy thử trước với một nhóm, số bài là 1, rồi xem bình luận có vào đúng bài không. Mã băm nhận diện bài đã đổi cách tính so với bản trước, nên bài chưa có liên kết đã bình luận bằng bản cũ có thể không được nhận ra qua lịch sử; CAP vẫn bỏ qua chúng nếu thấy bình luận của bạn trên trang.

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
