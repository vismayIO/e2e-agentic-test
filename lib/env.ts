import { existsSync } from 'node:fs';

// `.env` on a local machine (in CI the values come from the pipeline). Here, once: the scripts (parent process) and
// e2e.config.ts (e2e's child process) both import this module, so both get the same values.
if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * Read an env var; an empty value or an unresolved Azure DevOps macro
 * (literal "$(NAME)") counts as "not set".
 */
export function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v || /^\$\(.+\)$/.test(v)) return undefined;
  return v;
}
