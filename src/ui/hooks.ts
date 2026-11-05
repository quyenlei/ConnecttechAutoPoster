import { useEffect, useState } from 'react';
import type { WxtStorageItem } from 'wxt/utils/storage';
import { browser } from 'wxt/browser';
import type { CommandReply, RunCommand } from '@/lib/messages';

/** Live view of a storage item; updates when any extension page changes it. */
export function useItem<T>(item: WxtStorageItem<T, Record<string, unknown>>): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let alive = true;
    void item.getValue().then((v) => alive && setValue(v));
    const unwatch = item.watch((v) => setValue(v));
    return () => {
      alive = false;
      unwatch();
    };
  }, [item]);
  return value;
}

/** Re-renders every second while `active`, for countdowns. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export async function sendCommand(cmd: RunCommand): Promise<CommandReply> {
  try {
    return (await browser.runtime.sendMessage(cmd)) as CommandReply;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
