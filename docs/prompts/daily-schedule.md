# Prompt: Hẹn giờ chạy chiến dịch theo giờ cố định mỗi ngày

Dán toàn bộ nội dung dưới dòng kẻ vào Claude Code (mở trong thư mục dự án).

---

## Bối cảnh

Dự án là extension Chrome (Manifest V3) tên Connecttech Auto Poster (CAP). Hãy đọc `CLAUDE.md` và `.claude/rules/*` trước. Các quy tắc ở đó là bắt buộc, đặc biệt:

- Mọi giới hạn nằm trong `src/lib/limits.ts`, mọi chuyển trạng thái chạy nằm trong `src/lib/run-engine.ts`. Không nhân đôi hay lách chúng ở UI hoặc background.
- Không được chạy tự động hóa trên Facebook thật. Test chỉ dùng trang giả lập cục bộ (`pnpm test:e2e`). Không làm yếu khóa DNS trong `e2e/smoke.py`.
- Dùng `pnpm`, không dùng `npm`. Giao diện bằng tiếng Việt. Mã nguồn, tên biến, commit bằng tiếng Anh.
- Tính năng tự động mới phải là opt-in, hiển thị rõ trên giao diện và được ghi vào `docs/SAFETY_AND_PRIVACY.md`.
- Không thêm quyền (permission) hay host mới. `alarms` đã có sẵn. Không thêm thư viện mới.

Hiện tại người dùng phải tự bấm **Lưu và chạy**. `docs/ROADMAP.md` có mục "Scheduled campaigns" chưa làm.

## Mục tiêu

Cho phép mỗi chiến dịch có lịch chạy tự động theo **giờ cố định mỗi ngày** (giờ địa phương của máy). Người dùng chỉnh giờ tùy ý, ví dụ 07:00 và 14:00. Khi đến giờ, extension tự bắt đầu một lượt chạy giống hệt khi người dùng bấm **Lưu và chạy**.

Không làm: lịch theo ngày trong tuần, lịch theo ngày cụ thể, lặp theo chu kỳ phút, chạy khi Chrome đóng.

## Yêu cầu chức năng

1. **Dữ liệu.** Thêm trường tùy chọn `schedule` vào `Campaign` trong `src/lib/types.ts`:
   - `enabled: boolean` (mặc định tắt)
   - `times: string[]` dạng `"HH:mm"` 24 giờ, giờ địa phương.
   Chiến dịch cũ không có `schedule` phải vẫn hoạt động bình thường.
2. **Logic thuần** trong `src/lib/schedule.ts` (không phụ thuộc Chrome API), có test đầy đủ:
   - kiểm tra và chuẩn hóa danh sách giờ (loại trùng, sắp xếp, bỏ giá trị sai định dạng),
   - `nextOccurrence(times, now)` trả về mốc thời gian (epoch ms) kế tiếp, tính lại theo giờ địa phương mỗi lần để đúng khi đổi giờ mùa hè hoặc đổi múi giờ,
   - xác định một mốc đã bị lỡ quá lâu hay chưa.
3. **Giới hạn an toàn** trong `src/lib/limits.ts` (người dùng đã chốt):
   - tối đa **2 mốc** giờ mỗi ngày cho một chiến dịch (`maxScheduleTimesPerDay = 2`),
   - khoảng cách tối thiểu giữa hai mốc là **6 giờ** (`minScheduleGapMinutes = 360`). Tính theo vòng 24 giờ: khoảng cách từ mốc cuối đến mốc đầu của ngày hôm sau cũng phải đạt 6 giờ. Ví dụ 07:00 và 13:00 hợp lệ; 07:00 và 12:00 không; 07:00 và 02:00 không (chỉ cách 5 giờ qua nửa đêm).
   UI chỉ gợi ý; giá trị cuối cùng phải được chặn lại bằng các hằng số này khi lưu.
4. **Background** (`src/entrypoints/background.ts`):
   - Dùng đúng một alarm riêng cho lịch (ví dụ `cap-schedule`), đặt vào mốc gần nhất trong tất cả chiến dịch đang bật lịch. Mỗi khi alarm nổ, khi lưu chiến dịch, khi xóa chiến dịch và khi service worker khởi động lại, tính lại mốc kế tiếp từ dữ liệu đã lưu. Không dùng `setTimeout` dài hay `setInterval`.
   - Khi đến giờ, bắt đầu lượt chạy qua cùng đường đi với lệnh `cap/run/start` (cùng `validateCampaign`, `createRun`). Mọi `LIMITS` áp dụng như chạy tay. Dùng chung một hàm, không sao chép đoạn mã.
   - Nếu đang có lượt chạy khác (`isActive`), **bỏ qua** mốc đó và ghi nhật ký `info`, không xếp hàng.
   - Nếu mốc bị lỡ (Chrome đang đóng hoặc máy ngủ) và đã quá 10 phút, **không chạy bù**; ghi nhật ký `info` "Bỏ lỡ lịch HH:mm". Nếu trễ không quá 10 phút thì vẫn chạy.
   - Khi một lượt chạy kết thúc ở trạng thái `halted` (checkpoint hoặc bị Facebook chặn), **tự tắt toàn bộ lịch** và ghi nhật ký. Người dùng phải tự bật lại sau khi xử lý xong trên Facebook.
   - Mọi thông báo và nhật ký bằng tiếng Việt, chỉ chứa tên nhóm, trạng thái và lý do ngắn. Không ghi nội dung bài đăng.
5. **Giao diện** (`src/ui/views/CampaignsView.tsx`, thêm mục "Hẹn giờ chạy" trong phần Thời gian và an toàn, hoặc một nhóm riêng bên dưới):
   - Công tắc bật/tắt lịch, mặc định tắt.
   - Danh sách giờ dùng `<input type="time">`, có nhãn `<label>` thật, nút thêm và xóa từng mốc, có `aria-label` rõ ràng. Vô hiệu hóa nút "Thêm giờ" khi đã đủ 2 mốc.
   - Hiển thị dòng "Lần chạy tiếp theo: …" khi lịch đang bật.
   - Hiển thị ghi chú cố định: "Chrome phải đang mở và đã đăng nhập Facebook thì lịch mới chạy."
   - Nếu có 2 mốc mà chiến dịch chỉ có 1 phiên bản nội dung, hiện cảnh báo nhẹ: đăng cùng nội dung nhiều lần trong ngày dễ bị coi là spam; nên thêm phiên bản.
   - Khi giá trị vi phạm giới hạn (quá 2 mốc hoặc hai mốc cách nhau dưới 6 giờ), hiện lỗi rõ ràng bằng tiếng Việt và không lưu giá trị đó.
   - Tuân thủ quy ước SCSS/BEM của dự án (ví dụ `campaigns__schedule-time`), đơn vị `rem`, không `!important`, không style nội tuyến, tận dụng lại các class sẵn có (`field`, `button`, `notice`).
6. **Gọi tên chung.** Tên nút và nhãn tiếng Việt, ví dụ "Hẹn giờ chạy", "Thêm giờ", "Xóa giờ", "Lần chạy tiếp theo".

## Kiểm thử và hoàn tất

- Viết test trước cho `src/lib/schedule.ts` (TDD): giờ hợp lệ và không hợp lệ, trùng, sắp xếp, mốc kế tiếp trước/sau mốc cuối trong ngày, qua nửa đêm, mốc đúng bằng thời điểm hiện tại, ranh giới 10 phút, khoảng cách tối thiểu đúng 6 giờ (hợp lệ) và 5 giờ 59 phút (không hợp lệ), khoảng cách vòng qua nửa đêm, tối đa 2 mốc.
- Chạy và báo kết quả thật: `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`. Nếu thêm được một kịch bản e2e trên trang giả lập (đặt lịch vào phút kế tiếp rồi kiểm tra lượt chạy tự bắt đầu), hãy thêm; nếu không thì nói rõ phần nào chưa được kiểm tra tự động.
- Cập nhật tài liệu cùng lúc: `CHANGELOG.md`, `docs/USER_GUIDE.md` (cách bật lịch, lưu ý Chrome phải mở), `docs/ARCHITECTURE.md` (alarm lịch), `docs/SAFETY_AND_PRIVACY.md` (tính năng tự động opt-in, giới hạn mới, tự tắt khi bị chặn), `docs/ROADMAP.md` (đánh dấu xong). Giữ phiên bản trong `package.json` và `CHANGELOG.md` khớp nhau (đề xuất nâng lên 0.2.0).
- Ghi trung thực: lịch chỉ được kiểm tra trên trang giả lập, chưa kiểm chứng trên Facebook thật.
- Chưa commit khi chưa được yêu cầu.

## Cách làm việc

Trước khi viết mã, tóm tắt kế hoạch ngắn (các file sẽ sửa, cách tính alarm, cách xử lý mốc bị lỡ) để tôi xác nhận. Nếu có điểm nào mơ hồ, hãy nêu một khuyến nghị thay vì hỏi nhiều câu.

Ghi chú nhỏ cần xử lý luôn nếu thấy: trong `validateCampaign` còn một thông báo tiếng Anh `Maximum … groups per campaign.`; hãy đổi sang tiếng Việt.
