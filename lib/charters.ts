import { pathToFileURL } from 'node:url';
import { env } from './env.ts';
import { moduleFile } from './modules.ts';
import { freshNames } from './names.ts';

/**
 * Charters for exploratory and monkey testing. Charter = one goal for `e2e explore`: one area, one posture, one
 * sentence, with a start route (e2e docs: bug-bash → "Plan charters"). Each module keeps its charters in
 * `tests/<module>/charters.ts`; here they are loaded and turned into `e2e explore` arguments.
 * Strategy: docs/testing.md.
 */

/**
 * Posture = persona. The `agents` in e2e.config.ts are built from this list (one stance per persona), so
 * renaming one here stops the config from compiling until it is renamed there too.
 */
export const PERSONAS = ['explorer', 'skeptic', 'fuzzer'] as const;
export type Persona = (typeof PERSONAS)[number];

export interface Charter {
  /** Short slug (a-z, 0-9, -); the name in the report and of the output folder. The module name is added automatically. */
  id: string;
  persona: Persona;
  /** One sentence, starting with "Starting at /route, …". */
  goal: string;
  /** Exploration steps (1–100); when absent, the default from nightly.config. */
  maxSteps?: number;
}

/** Monkey's target: one create form. Not the forms of existing records — those hold real people's data. */
export interface MonkeyForm {
  route: string;
  /** How to reach the form, in the screen's labels: 'the "Create role" form'. */
  form: string;
}

/** The default export of `tests/<module>/charters.ts`. */
export interface ModuleCharters {
  /** Setup session that lets the exploration start signed in. Use the light `admin` session: explore runs its setup for every charter. */
  session: string;
  /** The module's data prefix (such as `iam-e2e`): whatever the explorer creates starts with it, so the module's cleanup removes it. */
  prefix: string;
  charters: readonly Charter[];
  monkey: readonly MonkeyForm[];
}

/** A charter ready to run. */
export interface PlannedCharter {
  id: string;
  module: string;
  kind: 'charter' | 'monkey';
  persona: Persona;
  session: string;
  goal: string;
  maxSteps?: number;
}

const explorers = new Map<string, ReturnType<typeof freshNames>>();
/**
 * This process's explorer names: `<prefix>-x-<id>-…`. Whatever the explorer creates has a name starting with
 * `.name('')` — by the id, the module's cleanup leaves a running exploration's data alone and removes it later.
 */
export function explorerNames(prefix: string): ReturnType<typeof freshNames> {
  if (!explorers.has(prefix)) explorers.set(prefix, freshNames(`${prefix}-x`));
  return explorers.get(prefix)!;
}

/** Appended to every charter's goal: what the explorer may create or change on the shared tenant. */
const rules = (prefix: string) =>
  ` Rules: every name you save, and the part before the @ of every email address you invite or import, starts with "${explorerNames(prefix).name('')}" — when an input cannot carry that prefix, type it, read the validation and cancel instead of saving. A record you did not create in this exploration may be opened only to read it: never tick, disable, delete, revoke or edit it. Choosing an existing role or organization inside a form you are filling in is fine.`;

const monkeyGoal = ({ route, form }: MonkeyForm) =>
  `Starting at ${route}, open ${form} and work only inside that form, like a careless, impatient user. In each of its fields try, one at a time: left empty, 300 characters, unicode and emoji, leading and trailing spaces, and special characters such as < > ' " % ; also double-click its buttons, and close and reopen the form half-way. Report validation that is missing or wrong, error messages that are misleading or leak technical detail, layouts that break, and anything that stops responding.`;

export async function moduleCharters(module: string): Promise<ModuleCharters | undefined> {
  const file = moduleFile(module, 'charters.ts');
  return file ? ((await import(pathToFileURL(file).href)) as { default: ModuleCharters }).default : undefined;
}

/** The written charters of these modules (none for a module without charters.ts). */
export async function charters(mods: readonly string[]): Promise<PlannedCharter[]> {
  const planned: PlannedCharter[] = [];
  for (const module of mods) {
    const m = await moduleCharters(module);
    for (const c of m?.charters ?? []) {
      planned.push({ id: `${module}-${c.id}`, module, kind: 'charter', persona: c.persona, session: m!.session, goal: c.goal + rules(m!.prefix), maxSteps: c.maxSteps });
    }
  }
  return planned;
}

/**
 * Seed: `MONKEY_SEED` (to repeat an earlier run), otherwise today's date as YYYYMMDD — so every night picks
 * differently, and the seed written in the report gives the same pick again.
 */
export function seedOfTheDay(): number {
  const given = env('MONKEY_SEED');
  if (given === undefined) return Number(new Date().toISOString().slice(0, 10).replaceAll('-', ''));
  if (!/^\d+$/.test(given)) throw new Error(`MONKEY_SEED must be a whole number, got "${given}"`);
  return Number(given);
}

/** `count` of `items` without repeats, seeded (mulberry32): same seed → same pick. */
export function pick<T>(items: readonly T[], count: number, seed: number): T[] {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length) picked.push(...pool.splice(Math.floor(next() * pool.length), 1));
  return picked;
}

/** Monkey: `count` random create forms from the modules, the fuzzer persona on each, `maxSteps` steps. */
export async function monkeyCharters(mods: readonly string[], count: number, seed: number, maxSteps: number): Promise<PlannedCharter[]> {
  const forms: { module: string; m: ModuleCharters; form: MonkeyForm }[] = [];
  for (const module of mods) {
    const m = await moduleCharters(module);
    for (const form of m?.monkey ?? []) forms.push({ module, m: m!, form });
  }
  return pick(forms, count, seed).map(({ module, m, form }) => ({
    id: `${module}-monkey-${`${form.route} ${form.form}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    module, kind: 'monkey' as const, persona: 'fuzzer' as const, session: m.session, goal: monkeyGoal(form) + rules(m.prefix), maxSteps,
  }));
}

/** `e2e explore` arguments for one charter; `budget.maxSteps` applies when the charter has none of its own. */
export function exploreArgs(c: PlannedCharter, outputDir: string, budget: { maxSteps: number; charterMinutes: number }): string[] {
  return ['explore', c.goal, '--agent', c.persona, '--session', c.session, '--output', outputDir,
    '--reporter', 'list,markdown', '--max-steps', String(c.maxSteps ?? budget.maxSteps), '--timeout', String(budget.charterMinutes * 60_000)];
}
