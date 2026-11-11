import type { Mode } from '../api';

interface Props {
  platformSupported: boolean;
  current: Mode | null;
  onChoose: (mode: Mode) => void;
  onCancel?: () => void;
}

/** First screen (and Settings → "Đổi cách dùng"): the two ways to run CAP. */
export function ChooseMode({ platformSupported, current, onChoose, onCancel }: Props) {
  return (
    <section className="screen" aria-labelledby="choose-title">
      <h1 id="choose-title" className="screen__title">Bạn muốn dùng CAP thế nào?</h1>
      <p className="screen__lead">Chọn một cách. Bạn có thể đổi lại sau trong Cài đặt.</p>
      {current && (
        <p className="notice">
          Dữ liệu CAP (nhóm, chiến dịch) không tự chuyển giữa hai cách. Trước khi đổi, mở CAP → tab <strong>Sao lưu</strong> →{' '}
          <strong>Xuất bản sao lưu</strong>, rồi nhập lại ở cách mới.
        </p>
      )}
      <div className="choices">
        <article className="choice">
          <h2 className="choice__title">Trình duyệt riêng</h2>
          <p className="choice__tag choice__tag--auto">Tự động hoàn toàn</p>
          <ul className="choice__list">
            <li>App tải một trình duyệt Chrome riêng (khoảng 150 MB) có sẵn CAP.</li>
            <li>Không phải bật Developer mode hay nạp tiện ích bằng tay.</li>
            <li>Đăng nhập Facebook một lần trong cửa sổ đó.</li>
            <li>Cập nhật bằng một nút trong app.</li>
          </ul>
          {platformSupported ? (
            <button className="button button--primary" type="button" onClick={() => onChoose('browser')}>
              Dùng trình duyệt riêng
            </button>
          ) : (
            <p className="choice__unavailable">Máy này chưa có bản trình duyệt phù hợp. Hãy dùng Chrome có sẵn.</p>
          )}
        </article>
        <article className="choice">
          <h2 className="choice__title">Chrome có sẵn</h2>
          <p className="choice__tag">Làm thủ công một lần</p>
          <ul className="choice__list">
            <li>Dùng Google Chrome bạn đang dùng, Facebook đã đăng nhập sẵn.</li>
            <li>Lần đầu: bật Developer mode và nạp CAP (khoảng 30 giây, app hướng dẫn).</li>
            <li>Sau đó app tự cập nhật, CAP tự tải lại.</li>
          </ul>
          <button className="button" type="button" onClick={() => onChoose('chrome')}>
            Dùng Chrome có sẵn
          </button>
        </article>
      </div>
      {onCancel && (
        <button className="button button--link" type="button" onClick={onCancel}>
          Quay lại
        </button>
      )}
    </section>
  );
}
