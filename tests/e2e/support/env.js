import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));
const REQUIRED_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_OWNER_EMAIL",
  "OWNER_TOKEN",
];

// Loads .env into process.env (keys already set in the shell win) and checks the e2e keys exist.
export function loadTestEnv() {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const missing = REQUIRED_KEYS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`e2e tests need ${missing.join(", ")} in .env or the environment.`);
  }
  return {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
    ownerEmail: process.env.VITE_OWNER_EMAIL,
    ownerToken: process.env.OWNER_TOKEN,
  };
}
