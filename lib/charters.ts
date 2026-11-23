import { pathToFileURL } from 'node:url';
import { env } from './env.ts';
import { moduleFile } from './modules.ts';
import { freshNames } from './names.ts';

/**
 * Exploratory aur monkey testing ke charters. Charter = `e2e explore` ka ek goal: ek area, ek posture, ek
 * sentence, start route ke saath (e2e docs: bug-bash → "Plan charters"). Har module apne charters
 * `tests/<module>/charters.ts` me rakhta hai; yahan unhe load karke `e2e explore` ke arguments bante hain.
 * Strategy: docs/testing.md.
 */

/**
 * Posture = persona. e2e.config.ts ke `agents` isi list se bante hain (har persona ka ek stance), isliye
 * yahan naam badle to config compile nahi hota jab tak wahan bhi na badle.
 */
export const PERSONAS = ['explorer', 'skeptic', 'fuzzer'] as const;
export type Persona = (typeof PERSONAS)[number];

export interface Charter {
  /** Chhota slug (a-z, 0-9, -); report aur output folder ka naam. Module ka naam khud jud jaata hai. */
  id: string;
  persona: Persona;
  /** Ek sentence, "Starting at /route, …" se shuru. */
  goal: string;
  /** Exploration steps (1–100); na ho to nightly.config ka default. */
  maxSteps?: number;
}

/** Monkey ka nishaana: ek create form. Maujooda records ke forms nahi — unme asli logon ka data hota hai. */
export interface MonkeyForm {
  route: string;
  /** Form tak kaise pahunchein, screen ke labels me: 'the "Create role" form'. */
  form: string;
}

/** `tests/<module>/charters.ts` ka default export. */
export interface ModuleCharters {
  /** Setup session jisse exploration signed-in shuru ho. Halka session rakho (`admin`): explore har charter pe uska setup chalata hai. */
  session: string;
  /** Module ka data prefix (jaise `iam-e2e`): explorer jo banaye woh isi se shuru ho, taaki module ka cleanup use hata de. */
  prefix: string;
  charters: readonly Charter[];
  monkey: readonly MonkeyForm[];
}

/** Chalne ke liye tayyar charter. */
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
 * Is process ke explorer naam: `<prefix>-x-<id>-…`. Explorer jo bhi banaye uska naam `.name('')` se shuru ho —
 * id se module ka cleanup chal rahe exploration ka data nahi chhedta, aur baad me use hata deta hai.
 */
export function explorerNames(prefix: string): ReturnType<typeof freshNames> {
  if (!explorers.has(prefix)) explorers.set(prefix, freshNames(`${prefix}-x`));
  return explorers.get(prefix)!;
}

/** Har charter ke goal ke aakhir me: shared tenant pe explorer kya bana/badal sakta hai. */
const rules = (prefix: string) =>
  ` Rules: every name you save, and the part before the @ of every email address you invite or import, starts with "${explorerNames(prefix).name('')}" — when an input cannot carry that prefix, type it, read the validation and cancel instead of saving. A record you did not create in this exploration may be opened only to read it: never tick, disable, delete, revoke or edit it. Choosing an existing role or organization inside a form you are filling in is fine.`;

const monkeyGoal = ({ route, form }: MonkeyForm) =>
  `Starting at ${route}, open ${form} and work only inside that form, like a careless, impatient user. In each of its fields try, one at a time: left empty, 300 characters, unicode and emoji, leading and trailing spaces, and special characters such as < > ' " % ; also double-click its buttons, and close and reopen the form half-way. Report validation that is missing or wrong, error messages that are misleading or leak technical detail, layouts that break, and anything that stops responding.`;

export async function moduleCharters(module: string): Promise<ModuleCharters | undefined> {
  const file = moduleFile(module, 'charters.ts');
  return file ? ((await import(pathToFileURL(file).href)) as { default: ModuleCharters }).default : undefined;
}

/** In modules ke likhe hue charters (jis module me charters.ts nahi, uske koi nahi). */
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
 * Seed: `MONKEY_SEED` (koi purana run dobara chalane ke liye), warna aaj ki tareekh YYYYMMDD — to har raat
 * alag chunaav, aur report me likha seed wahi chunaav dobara deta hai.
 */
export function seedOfTheDay(): number {
  const given = env('MONKEY_SEED');
  if (given === undefined) return Number(new Date().toISOString().slice(0, 10).replaceAll('-', ''));
  if (!/^\d+$/.test(given)) throw new Error(`MONKEY_SEED ek poora number hona chahiye, mila "${given}"`);
  return Number(given);
}

/** `items` me se `count` bina dohraaye, seeded (mulberry32): wahi seed → wahi chunaav. */
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

/** Monkey: modules ke create forms me se `count` random, har ek pe fuzzer persona, `maxSteps` steps. */
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

/** `e2e explore` ke arguments ek charter ke liye; `budget.maxSteps` tab jab charter ka apna na ho. */
export function exploreArgs(c: PlannedCharter, outputDir: string, budget: { maxSteps: number; charterMinutes: number }): string[] {
  return ['explore', c.goal, '--agent', c.persona, '--session', c.session, '--output', outputDir,
    '--reporter', 'list,markdown', '--max-steps', String(c.maxSteps ?? budget.maxSteps), '--timeout', String(budget.charterMinutes * 60_000)];
}
