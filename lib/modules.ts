import { existsSync, readdirSync } from 'node:fs';

const ROOT = 'tests';

/**
 * Modules = the folders of `tests/` that hold at least one `*.e2e.ts` (such as `app`, `iam`).
 * To add a module, just create the folder — suites, charters and verify find it by themselves.
 */
export function modules(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && readdirSync(`${ROOT}/${d.name}`).some((f) => f.endsWith('.e2e.ts')))
    .map((d) => d.name)
    .sort();
}

/** Module name → `tests/<module>` path; a clear error on an unknown name (so a typo does not run the whole suite). */
export function modulePaths(names: readonly string[]): string[] {
  const known = modules();
  for (const name of names) {
    if (!known.includes(name)) throw new Error(`module "${name}" not found — existing: ${known.join(', ')}`);
  }
  return names.map((name) => `${ROOT}/${name}`);
}

/** Module names from the command line → list of modules: checked; all of them when none is given. */
export function resolveModules(names: readonly string[]): string[] {
  modulePaths(names);
  return names.length ? [...names] : modules();
}

/** The path of one of a module's files, if it exists (such as charters.ts, coverage.ts). */
export function moduleFile(module: string, file: string): string | undefined {
  const path = `${ROOT}/${module}/${file}`;
  return existsSync(path) ? path : undefined;
}
