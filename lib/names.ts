import { env } from './env.ts';

/**
 * Names for test data, and Mailosaur addresses. Each module has its own prefix (such as `iam-e2e`), and its
 * setup clears earlier runs' data with that prefix (tests/app/cleanup.ts).
 *
 * Call it in the module scope of a test file (or setup file). e2e re-imports the test file on a retry and for a
 * serial group, so every attempt gets new names — data left by the first attempt ("already exists",
 * "already in use") does not collide with the next. Within one attempt the names are stable.
 */
export function freshNames(prefix: string) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
  const name = (label: string) => `${prefix}-${id}-${label}`;
  const inbox = env('MAILOSAUR_SERVER_ID');
  return {
    /** This attempt's id — the same in every name, so one prefix finds all of this attempt's data. */
    id,
    name,
    /** Mailosaur address — no mail goes to a real person. */
    address: (label: string) => {
      if (!inbox) throw new Error('Set MAILOSAUR_SERVER_ID — test addresses belong to that inbox');
      return `${name(label)}@${inbox}.mailosaur.net`;
    },
  };
}

/**
 * When a name made by `freshNames` was created (the id starts with a base36 `Date.now()`) — cleanup uses it to
 * leave running runs' data alone. A name not of this shape (made by hand, or decoding to a time in the future)
 * has no time: `undefined`.
 */
export function createdAt(name: string, prefix: string): number | undefined {
  const id = name.toLowerCase().match(new RegExp(`^${prefix}-(?:x-)?([0-9a-z]+)-`))?.[1];
  const ms = id ? parseInt(id.slice(0, -2), 36) : NaN;
  return Number.isFinite(ms) && ms <= Date.now() ? ms : undefined;
}
