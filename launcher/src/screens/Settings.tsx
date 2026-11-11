import { useEffect, useState } from 'react';
import { openDataFolder, readLog, type Status } from '../api';

interface Props {
  status: Status;
  onChangeMode: () => void;
  onClose: () => void;
}

export function Settings({ status, onChangeMode, onClose }: Props) {
  const [log, setLog] = useState('');
  useEffect(() => {
    void readLog().then(setLog);
  }, []);

  return (
    <section className="screen" aria-labelledby="settings-title">
      <h1 id="settings-title" className="screen__title">Cài đặt</h1>
      <dl className="facts">
        <div className="facts__row">
          <dt>Cách dùng</dt>
          <dd>{status.mode === 'browser' ? 'Trình duyệt riêng' : 'Chrome có sẵn'}</dd>
        </div>
        <div className="facts__row">
          <dt>Phiên bản app</dt>
          <dd>{status.appVersion}</dd>
        </div>
        <div className="facts__row">
          <dt>Thư mục CAP</dt>
          <dd><code>{status.extensionPath}</code></dd>
        </div>
      </dl>
      <div className="screen__actions">
        <button className="button" type="button" onClick={onChangeMode} disabled={status.browserRunning}>Đổi cách dùng</button>
        <button className="button" type="button" onClick={() => void openDataFolder()}>Mở thư mục dữ liệu</button>
        <button className="button button--link" type="button" onClick={onClose}>Quay lại</button>
      </div>
      <h2 className="screen__subtitle">Nhật ký gần đây</h2>
      <pre className="log" tabIndex={0} aria-label="Nhật ký của app">{log || 'Chưa có.'}</pre>
    </section>
  );
}
