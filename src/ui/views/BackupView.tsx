import { useState } from 'react';
import { browser } from 'wxt/browser';
import { buildBackup, parseBackup, planImport, type Backup, type DroppedCounts, type ImportPreview } from '@/lib/backup';
import { readBackupData, writeImportedData } from '@/lib/storage';

interface Pending {
  fileName: string;
  backup: Backup;
  dropped: DroppedCounts;
  preview: ImportPreview;
}

interface Message {
  text: string;
  danger: boolean;
}

function SummaryRow({ label, added, existing }: { label: string; added: number; existing: number }) {
  return (
    <tr className="table__row">
      <th className="table__cell" scope="row">{label}</th>
      <td className="table__cell u-tabular">{added}</td>
      <td className="table__cell u-tabular">{existing}</td>
    </tr>
  );
}

export function BackupView() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [inputKey, setInputKey] = useState(0);

  async function exportBackup() {
    const backup = buildBackup(await readBackupData(), browser.runtime.getManifest().version, Date.now());
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cap-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ text: 'Đã xuất bản sao lưu. Hãy giữ file ở nơi an toàn.', danger: false });
  }

  async function chooseFile(file: File | undefined) {
    setPending(null);
    setMessage(null);
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setMessage({ text: parsed.error, danger: true });
      setInputKey((k) => k + 1);
      return;
    }
    const { preview } = planImport(await readBackupData(), parsed.backup);
    setPending({ fileName: file.name, backup: parsed.backup, dropped: parsed.dropped, preview });
  }

  function cancel() {
    setPending(null);
    setInputKey((k) => k + 1);
  }

  async function confirmImport() {
    if (!pending) return;
    // Merge again with the data as it is now, in case it changed since the preview.
    const { merged, preview } = planImport(await readBackupData(), pending.backup);
    const result = await writeImportedData(merged);
    if (!result.ok) {
      setMessage({ text: result.error, danger: true });
      return;
    }
    const off = preview.schedulesTurnedOff > 0 ? ` ${preview.schedulesTurnedOff} lịch hẹn giờ đã được tắt, hãy bật lại ở tab Chiến dịch nếu cần.` : '';
    setMessage({
      text: `Đã nhập ${preview.groups.added} nhóm, ${preview.campaigns.added} chiến dịch, ${preview.logs.added} dòng nhật ký.${off}`,
      danger: false,
    });
    cancel();
  }

  const droppedTotal = pending ? pending.dropped.groups + pending.dropped.campaigns + pending.dropped.logs + pending.dropped.images : 0;
  const imagesInFile = pending ? pending.backup.data.campaigns.reduce((sum, c) => sum + (c.images?.length ?? 0), 0) : 0;

  return (
    <div className="shell__stack">
      <section className="card" aria-labelledby="backup-export">
        <div className="card__head">
          <h2 id="backup-export">Xuất bản sao lưu</h2>
        </div>
        <p>Lưu nhóm, chiến dịch (kèm ảnh đính kèm), cài đặt và nhật ký vào một file JSON trên máy của bạn.</p>
        <p className="notice" role="note">
          File sao lưu chứa nội dung bài đăng, tên nhóm, nhật ký và nay có thể chứa cả ảnh đính kèm của chiến dịch (file có thể nặng vài MB). File chưa được mã hóa. Hãy giữ file ở nơi an toàn.
        </p>
        <div className="backup__actions">
          <button className="button button--primary" type="button" onClick={() => void exportBackup()}>Xuất bản sao lưu</button>
        </div>
      </section>

      <section className="card" aria-labelledby="backup-import">
        <div className="card__head">
          <h2 id="backup-import">Nhập bản sao lưu</h2>
        </div>
        <p>Dữ liệu trong file được gộp vào dữ liệu hiện có. Mục đã có sẽ được giữ nguyên, không bị ghi đè hay xóa.</p>
        <div className="field">
          <label className="field__label" htmlFor="backup-file">File sao lưu (.json)</label>
          <input
            key={inputKey}
            id="backup-file"
            className="field__control"
            type="file"
            accept=".json,application/json"
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
        </div>

        {pending && (
          <div className="backup__preview" role="region" aria-label="Xem trước khi nhập">
            <h3 className="backup__preview-title">Xem trước: {pending.fileName}</h3>
            <div className="table__scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table__cell table__cell--head" scope="col">Loại</th>
                    <th className="table__cell table__cell--head" scope="col">Sẽ thêm mới</th>
                    <th className="table__cell table__cell--head" scope="col">Đã có (giữ nguyên)</th>
                  </tr>
                </thead>
                <tbody>
                  <SummaryRow label="Nhóm" {...pending.preview.groups} />
                  <SummaryRow label="Chiến dịch" {...pending.preview.campaigns} />
                  <SummaryRow label="Dòng nhật ký" {...pending.preview.logs} />
                </tbody>
              </table>
            </div>
            <ul className="backup__preview-notes">
              <li>
                {pending.preview.schedulesTurnedOff > 0
                  ? `${pending.preview.schedulesTurnedOff} chiến dịch có lịch hẹn giờ. Lịch sẽ được tắt khi nhập, bạn tự bật lại sau.`
                  : 'Không có lịch hẹn giờ nào cần tắt.'}
              </li>
              <li>
                {pending.preview.settingsApplied
                  ? 'Cài đặt trong file sẽ được áp dụng vì cài đặt hiện tại là mặc định.'
                  : 'Cài đặt hiện tại được giữ nguyên.'}
              </li>
              {droppedTotal > 0 && (
                <li>
                  {droppedTotal} mục không hợp lệ sẽ bị bỏ qua ({pending.dropped.groups} nhóm, {pending.dropped.campaigns} chiến dịch, {pending.dropped.logs} dòng nhật ký, {pending.dropped.images} ảnh).
                </li>
              )}
              <li>
                {imagesInFile > 0
                  ? `File có ${imagesInFile} ảnh đính kèm.${pending.preview.imagesDropped > 0 ? ` ${pending.preview.imagesDropped} ảnh sẽ bị bỏ qua vì vượt giới hạn tổng dung lượng ảnh.` : ''}`
                  : 'File không có ảnh đính kèm.'}
              </li>
              <li>Việc nhập không bao giờ tự bắt đầu một lượt chạy.</li>
            </ul>
            <div className="backup__actions">
              <button className="button button--primary" type="button" onClick={() => void confirmImport()}>Nhập dữ liệu</button>
              <button className="button" type="button" onClick={cancel}>Hủy</button>
            </div>
          </div>
        )}
      </section>

      {message && (
        <p className={message.danger ? 'notice notice--danger' : 'notice'} role={message.danger ? 'alert' : 'status'}>{message.text}</p>
      )}
    </div>
  );
}
