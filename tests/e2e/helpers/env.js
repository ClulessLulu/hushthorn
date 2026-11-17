// Loads staging settings and refuses to run against anything else.
// These tests create, edit and delete books, so production must be unreachable.
import { existsSync, readFileSync } from 'node:fs';

export const STAGING_REF = 'shwhzfpqjbwukjztlzee';
export const PROD_REF = 'ujxsrcxbhcbihhdluzyl';
export const BASE_URL = 'http://localhost:5174'; // `npm run dev:staging`

function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

let cached;
export function loadConfig() {
  if (cached) return cached;
  const env = { ...readEnvFile('.env.staging'), ...readEnvFile('.env.staging.local'), ...process.env };
  const need = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'E2E_ALPHA_EMAIL', 'E2E_ALPHA_PASSWORD'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')}. Supabase values live in .env.staging; the test account lives in .env.staging.local (see tests/e2e/README.md).`);
  }
  const url = env.VITE_SUPABASE_URL.replace(/\/+$/, '');
  const host = new URL(url).hostname;
  if (host !== `${STAGING_REF}.supabase.co`) {
    throw new Error(`Refusing to run: ${host} is not the staging project. These tests write and delete data.`);
  }
  cached = {
    url,
    anonKey: env.VITE_SUPABASE_ANON_KEY,
    alpha: { email: env.E2E_ALPHA_EMAIL, password: env.E2E_ALPHA_PASSWORD },
  };
  return cached;
}
