/**
 * Env var padho; khaali value ya Azure DevOps ka unresolved macro
 * (literal "$(NAME)") ko "set nahi hai" maano.
 */
export function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v || /^\$\(.+\)$/.test(v)) return undefined;
  return v;
}

/** Test user configured hai? (login wale tests + explore --session isi pe chalte hain) */
export function hasLogin(): boolean {
  return Boolean(env('E2E_USER_QA_USERNAME') && env('E2E_USER_QA_PASSWORD'));
}
