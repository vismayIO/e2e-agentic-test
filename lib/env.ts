import { existsSync } from 'node:fs';

// Local machine pe `.env` (CI me values pipeline se aati hain). Yahin, ek hi baar: scripts (parent process) aur
// e2e.config.ts (e2e ka child process) dono yeh module import karte hain, to dono ko wahi values milti hain.
if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * Env var padho; khaali value ya Azure DevOps ka unresolved macro
 * (literal "$(NAME)") ko "set nahi hai" maano.
 */
export function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v || /^\$\(.+\)$/.test(v)) return undefined;
  return v;
}
