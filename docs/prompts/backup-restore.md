# Prompt: Sao lưu và khôi phục dữ liệu (JSON)

Dán toàn bộ nội dung dưới dòng kẻ vào Claude Code (mở trong thư mục dự án, nhánh `feature/backup-restore`).

---

## Bối cảnh

Dự án là extension Chrome (Manifest V3) tên Connecttech Auto Poster (CAP). Hãy đọc `CLAUDE.md`, `.claude/rules/*` và **bản thiết kế đã chốt** `docs/superpowers/specs/2026-11-09-backup-restore-design.md` trước khi làm. Bản thiết kế là nguồn chính; prompt này chỉ tóm tắt và bổ sung cách làm. Nếu hai bên mâu thuẫn, hỏi lại tôi thay vì tự chọn.

Các quy tắc bắt buộc:

- Mọi giới hạn nằm trong `src/lib/limits.ts`. Dùng lại `LIMITS` và `clampDelay`, không nhân đôi giá trị.
- Logic trong `src/lib/*` phải thuần (không phụ thuộc Chrome API hay React) và mỗi thay đổi có test trong `tests/`.
- Không chạy tự động hóa trên Facebook thật. Test chỉ dùng trang giả lập cục bộ (`pnpm test:e2e`). Không làm yếu khóa DNS trong `e2e/smoke.py`.
- Dùng `pnpm`, không dùng `npm`. Giao diện bằng tiếng Việt. Mã nguồn, tên biến, commit bằng tiếng Anh.
- Không thêm quyền (permission) hay host mới. Không thêm thư viện mới. Không gọi mạng.
- Không đọc, lưu hay gửi cookie/token Facebook.

## Mục tiêu

Cho người dùng **xuất** dữ liệu ra một file JSON và **nhập** lại từ file đó, hoàn toàn trên máy, để không mất dữ liệu khi reset profile Chrome hoặc đổi máy.

Dữ liệu hiện lưu trong `chrome.storage.local` (xem `src/lib/storage.ts`). Chỉ xuất: `groups`, `campaigns`, `settings`, `logs`. **Không** xuất `run`, `commentedPosts`, `scheduleCheck` (trạng thái kỹ thuật; khôi phục có thể làm lượt chạy tự tiếp tục hoặc làm lọt bình luận trùng).

Không làm: mã hóa, đồng bộ đám mây, sao lưu tự động, xuất/nhập một phần.

## Quyết định đã chốt (không đổi)

1. Xuất gồm nhóm, chiến dịch, cài đặt và nhật ký hoạt động.
2. Nhập theo kiểu **gộp có xem trước**, không xóa dữ liệu hiện có.
3. **Lịch hẹn giờ bị tắt khi nhập.** Mọi chiến dịch nhập vào có `schedule.enabled = false` (giữ nguyên `times`). Màn xem trước và thông báo kết quả nói rõ đã tắt bao nhiêu lịch để người dùng bật lại.
4. File nhập không bao giờ được tự bắt đầu một lượt chạy hay bật hành vi tự động nào.
5. File sửa tay hoặc độc hại không được vượt `LIMITS` hay làm hỏng dữ liệu hiện có.

## Yêu cầu chức năng

### 1. Định dạng file
```json
{
  "app": "connecttech-auto-poster",
  "formatVersion": 1,
  "exportedAt": 1731120000000,
  "appVersion": "<version trong manifest>",
  "data": { "groups": [], "campaigns": [], "settings": {}, "logs": [] }
}
```
Tên file: `cap-backup-YYYY-MM-DD.json`. Xuất bằng `Blob` + liên kết tải tạm, giống cách xuất CSV trong `src/ui/views/ActivityView.tsx`.

### 2. Logic thuần: `src/lib/backup.ts`
- `buildBackup(data, appVersion, now)` tạo đối tượng backup từ dữ liệu hiện tại.
- `parseBackup(text)` trả về `{ ok: true, backup, dropped }` hoặc `{ ok: false, error }` (thông báo tiếng Việt):
  - từ chối file lớn hơn 5 MB, JSON hỏng, sai `app`, `formatVersion` mới hơn bản hỗ trợ;
  - kiểm tra kiểu của từng trường; **bỏ từng mục sai** và đếm số mục bị bỏ thay vì hỏng cả file khi có thể;
  - chiến dịch đi qua `clampDelay`/`LIMITS`: độ trễ, số phiên bản nội dung (`maxVariations`), độ dài bài (`maxPostLength`), số nhóm (`maxGroupsPerCampaign`), số bình luận mỗi nhóm (`maxCommentsPerGroup`), lịch (`maxScheduleTimesPerDay`, `minScheduleGapMinutes`, dùng lại hàm trong `src/lib/schedule.ts`);
  - URL nhóm phải qua `parseGroupSlug` và `canonicalGroupUrl` trong `src/lib/groups.ts`; loại mục không phải nhóm Facebook hợp lệ;
  - chuỗi lạ không được đi vào DOM theo cách nguy hiểm (React đã escape, nhưng vẫn chỉ nhận các trường đã biết, bỏ trường thừa như `__proto__`).
- `planImport(current, backup)` trả về số liệu xem trước và dữ liệu đã gộp:
  - gộp theo `id`; id đã có thì **giữ mục hiện tại**, không ghi đè; đếm "mới" và "đã có";
  - nhóm cũng khử trùng theo URL chuẩn; `groupIds` của chiến dịch trong file được ánh xạ về id nhóm hiện có khi URL đã tồn tại; `groupIds` không khớp nhóm nào sau khi gộp thì bỏ;
  - nhật ký gộp theo `id`, sắp theo `ts`, giữ tối đa 2000 mục mới nhất (dùng chung hằng số với `appendLog`, đừng nhân đôi số 2000);
  - cài đặt của file chỉ áp dụng nếu cài đặt hiện tại đang là mặc định (`DEFAULT_SETTINGS`); nếu không thì giữ hiện tại, và xem trước nói rõ điều này;
  - mọi chiến dịch nhập vào có `schedule.enabled = false`; trả về số lịch đã tắt.
- Một hàm async mỏng ghi kết quả vào storage (đặt ở `src/lib/storage.ts` hoặc cạnh đó), không chứa logic gộp.

### 3. Chặn khi đang chạy
Từ chối nhập khi lượt chạy đang `running`, `paused` hoặc đang hoạt động theo `isActive` trong `src/lib/run-engine.ts`, kèm thông báo yêu cầu dừng hoặc chờ lượt chạy xong. Kiểm tra trạng thái ngay trước lúc ghi, không chỉ lúc mở file. Không đụng vào logic chuyển trạng thái; chỉ đọc.

### 4. Giao diện
Thêm tab **"Sao lưu"** (xem cách các tab khác được thêm trong `src/ui/App.tsx`) với view mới `src/ui/views/BackupView.tsx`:
- Nút "Xuất bản sao lưu".
- Chọn file nhập bằng `<label>` thật + `<input type="file" accept=".json">`.
- Khung xem trước: số nhóm/chiến dịch/nhật ký **mới** và **đã có**, số mục bị bỏ vì không hợp lệ, số lịch đã tắt, ghi chú về cài đặt.
- Nút "Nhập dữ liệu" và "Hủy"; sau khi nhập hiện thông báo kết quả (dùng các lớp `notice` hiện có), có `role="status"` hoặc `role="alert"` phù hợp.
- Ghi chú cố định: "File sao lưu chứa nội dung bài đăng, tên nhóm và nhật ký, chưa được mã hóa. Hãy giữ file ở nơi an toàn."
- Tuân thủ quy ước SCSS/BEM của dự án (`backup__...`, thêm `src/ui/styles/pages/_backup.scss`), đơn vị `rem`, không `!important`, không style nội tuyến, tận dụng `field`, `button`, `card`, `notice`, hỗ trợ sáng/tối bằng biến CSS, focus nhìn thấy được.
- Sau khi nhập, dữ liệu hiển thị ở các tab khác phải cập nhật (xem `src/ui/hooks.ts`).

## Kiểm thử và hoàn tất

- Viết test trước (TDD) trong `tests/backup.test.ts`. Gợi ý: file hợp lệ khứ hồi (build → parse → plan) cho kết quả giống ban đầu; JSON hỏng; sai `app`; `formatVersion` mới hơn; file quá 5 MB; mục sai bị bỏ và được đếm; độ trễ dưới 30 giây được nâng lên; vượt `maxVariations`, `maxPostLength`, `maxGroupsPerCampaign`; lịch vi phạm giới hạn bị chỉnh/loại; mọi lịch nhập vào đều tắt; id trùng giữ bản hiện tại; nhóm trùng URL khác id được ánh xạ lại `groupIds`; `groupIds` mồ côi bị bỏ; nhật ký gộp, sắp xếp, cắt đúng 2000; cài đặt áp dụng khi là mặc định và giữ nguyên khi không; trường `__proto__` bị bỏ; nhập hai lần liên tiếp không tạo bản sao.
- Chạy và báo kết quả thật: `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.
- Thêm một bước e2e trên trang giả lập trong `e2e/smoke.py` nếu khả thi: xuất, xóa dữ liệu, nhập, kiểm tra số lượng và lịch đã tắt. Nếu không làm được, nói rõ phần nào chưa được kiểm tra tự động.
- Cập nhật tài liệu cùng lúc: `CHANGELOG.md`, `docs/USER_GUIDE.md` (cách xuất/nhập, lịch bị tắt sau khi nhập), `docs/ARCHITECTURE.md` (module `backup.ts`), `docs/SAFETY_AND_PRIVACY.md` (file chứa bài đăng, tên nhóm, nhật ký; nằm trên máy; không mã hóa; lịch nhập vào bị tắt), `docs/ROADMAP.md` (đánh dấu mục "Backup and restore"). Giữ phiên bản trong `package.json` và `CHANGELOG.md` khớp nhau.
- Ghi trung thực: tính năng chỉ được kiểm tra bằng test đơn vị và trang giả lập; không liên quan đến Facebook thật.
- Chưa commit khi chưa được yêu cầu.

## Cách làm việc

Trước khi viết mã, tóm tắt kế hoạch ngắn (các file sẽ tạo/sửa, chữ ký các hàm trong `backup.ts`, cách chặn khi đang chạy) để tôi xác nhận. Nếu có điểm mơ hồ, hãy nêu một khuyến nghị thay vì hỏi nhiều câu.

Phần để bạn quyết: tên module/hàm cụ thể, câu chữ tiếng Việt, bố cục khung xem trước, danh sách test chi tiết.
