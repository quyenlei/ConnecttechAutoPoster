import { LIMITS } from './limits';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MIN = 24 * 60;
/** Never look back further than this when catching up after a long sleep. */
const MAX_LOOKBACK_DAYS = 2;

/** "HH:mm" -> minutes since midnight, or null when malformed. */
export function parseTime(value: string): number | null {
  const m = TIME.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Keeps valid "HH:mm" values only, without duplicates, sorted. */
export function normalizeTimes(raw: string[]): string[] {
  return [...new Set(raw.map((t) => t.trim()).filter((t) => parseTime(t) !== null))].sort();
}

/** Returns a Vietnamese error message, or null when the times respect the limits. */
export function validateTimes(raw: string[]): string | null {
  const times = normalizeTimes(raw);
  if (times.length > LIMITS.maxScheduleTimesPerDay) {
    return `Tối đa ${LIMITS.maxScheduleTimesPerDay} mốc giờ mỗi ngày.`;
  }
  if (times.length < 2) return null;
  const minutes = times.map((t) => parseTime(t) as number);
  for (let i = 0; i < minutes.length; i++) {
    const next = minutes[(i + 1) % minutes.length] as number;
    const current = minutes[i] as number;
    const gap = (next - current + DAY_MIN) % DAY_MIN; // wraps past midnight
    if (gap < LIMITS.minScheduleGapMinutes) {
      return `Hai mốc giờ phải cách nhau ít nhất ${LIMITS.minScheduleGapMinutes / 60} giờ (tính cả qua nửa đêm).`;
    }
  }
  return null;
}

/** Epoch ms of "HH:mm" on the local calendar day of `day`. Recomputed per call, so DST-safe. */
function atLocalTime(day: Date, time: string): number {
  const mins = parseTime(time) as number;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(mins / 60), mins % 60, 0, 0).getTime();
}

/** First scheduled moment at or after `now`, in local time. */
export function nextOccurrence(rawTimes: string[], now: number): number | null {
  const times = normalizeTimes(rawTimes);
  if (times.length === 0) return null;
  const today = new Date(now);
  for (const t of times) {
    const at = atLocalTime(today, t);
    if (at >= now) return at;
  }
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return atLocalTime(tomorrow, times[0] as string);
}

/** True when a scheduled moment is too old to start safely. */
export function isMissed(due: number, now: number): boolean {
  return now - due > LIMITS.scheduleGraceMinutes * 60_000;
}

/** Scheduled moments in (since, now], oldest first. */
export function dueOccurrences(rawTimes: string[], since: number, now: number): number[] {
  const times = normalizeTimes(rawTimes);
  if (times.length === 0 || since >= now) return [];
  const from = Math.max(since, now - MAX_LOOKBACK_DAYS * DAY_MIN * 60_000);
  const result: number[] = [];
  const end = new Date(now);
  for (let d = new Date(from); ; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    for (const t of times) {
      const at = atLocalTime(d, t);
      if (at > from && at <= now) result.push(at);
    }
    if (d.getFullYear() === end.getFullYear() && d.getMonth() === end.getMonth() && d.getDate() === end.getDate()) break;
  }
  return result.sort((a, b) => a - b);
}
