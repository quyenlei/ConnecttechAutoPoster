import type { LogEntry } from './types';

/** Neutralizes spreadsheet formula injection and escapes quotes. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function logsToCsv(logs: LogEntry[]): string {
  const header = ['time', 'status', 'group', 'message'].map(csvCell).join(',');
  const rows = logs.map((l) =>
    [new Date(l.ts).toISOString(), l.status, l.groupName, l.message].map(csvCell).join(','),
  );
  return [header, ...rows].join('\r\n');
}
