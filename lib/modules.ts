import { existsSync, readdirSync } from 'node:fs';

const ROOT = 'tests';

/**
 * Modules = `tests/` ke woh folders jinme kam se kam ek `*.e2e.ts` ho (jaise `app`, `iam`).
 * Naya module jodne ke liye bas folder banao — suites, charters aur verify use khud dhoondh lete hain.
 */
export function modules(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && readdirSync(`${ROOT}/${d.name}`).some((f) => f.endsWith('.e2e.ts')))
    .map((d) => d.name)
    .sort();
}

/** Module naam → `tests/<module>` path; anjaan naam pe saaf error (typo se poora suite na chal jaaye). */
export function modulePaths(names: readonly string[]): string[] {
  const known = modules();
  for (const name of names) {
    if (!known.includes(name)) throw new Error(`module "${name}" nahi mila — maujooda: ${known.join(', ')}`);
  }
  return names.map((name) => `${ROOT}/${name}`);
}

/** Command line ke module naam → modules ki list: jaanche hue; koi na diya ho to sab. */
export function resolveModules(names: readonly string[]): string[] {
  modulePaths(names);
  return names.length ? [...names] : modules();
}

/** Module ki ek file ka path, agar woh hai (jaise charters.ts, coverage.ts). */
export function moduleFile(module: string, file: string): string | undefined {
  const path = `${ROOT}/${module}/${file}`;
  return existsSync(path) ? path : undefined;
}
