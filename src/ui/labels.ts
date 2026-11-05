import type { LogStatus, RunStatus } from '@/lib/types';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'Chờ',
  running: 'Đang chạy',
  paused: 'Tạm dừng',
  done: 'Hoàn tất',
  stopped: 'Đã dừng',
  halted: 'Bị chặn',
};

export const LOG_STATUS_LABEL: Record<LogStatus | 'all', string> = {
  all: 'Tất cả',
  posted: 'Đã đăng',
  failed: 'Thất bại',
  skipped: 'Đã bỏ qua',
  break: 'Nghỉ an toàn',
  info: 'Thông tin',
};
