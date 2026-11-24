import { createdAt } from '../../lib/names.ts';
import type { ListPage } from './ui.ts';

/** Data younger than this may belong to a run in progress (the nightly, someone's local run, an explorer) — leave it alone. */
const IN_USE_MS = 3 * 60 * 60 * 1000;

/**
 * Housekeeping for a module setup: search `list` by `prefix` and remove every item of finished runs one by
 * one with `remove`. The list is read again each time (rows shift after a removal).
 *
 * Skip an item that cannot be removed and remove the rest, then fail at the end naming them all — old test
 * data must not pile up silently. (Names are new for every attempt, so leftover data does not break new
 * tests; the failure only says that the cleanup or the app's delete is broken somewhere.)
 */
export async function sweep(what: string, list: ListPage, open: () => Promise<void>, prefix: string, remove: (key: string) => Promise<void>): Promise<void> {
  // A name without a time (not from freshNames) cannot belong to a run in progress — remove it too.
  const finished = (key: string) => (createdAt(key, prefix) ?? 0) < Date.now() - IN_USE_MS;
  const failed = new Map<string, string>();
  await open();
  await list.search(prefix);
  for (;;) {
    const key = (await list.keys(prefix)).find((k) => finished(k) && !failed.has(k));
    if (!key) break;
    try {
      await remove(key);
    } catch (err) {
      failed.set(key, (err as Error).message.split('\n')[0]);
      await open(); // a dialog / drawer may be left half open
      await list.search(prefix);
    }
  }
  if (failed.size) {
    throw new Error(`cleanup: ${failed.size} old ${what} could not be removed:\n${[...failed].map(([k, e]) => `  ${k}: ${e}`).join('\n')}`);
  }
}
