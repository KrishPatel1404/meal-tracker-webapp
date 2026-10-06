import { createClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./env.js";

// src/config.js reads import.meta.env (Vite only), so Node-side tests name these themselves.
const PHOTO_BUCKET = "meal-photos";
const TABLES = Object.freeze({ DAYS: "days", MEAL_LOGS: "meal_logs", EXTRAS: "extras" });

// Every e2e write lands in this year, so cleanup can never touch real days.
export const TEST_YEAR = "2001";
const TEST_YEAR_FIRST_DAY = `${TEST_YEAR}-01-01`;
const TEST_YEAR_LAST_DAY = `${TEST_YEAR}-12-31`;
const STORAGE_LIST_LIMIT = 1000;

const env = loadTestEnv();
let ownerPromise = null;

// Signs in once per worker. The captured storage entry is exactly what supabase-js keeps in
// localStorage, so the browser can reuse this session instead of signing in for every test.
async function signInOwner() {
  const store = new Map();
  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key),
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: env.ownerEmail,
    password: env.ownerToken,
  });
  if (error) throw new Error(`Owner sign in for e2e failed: ${error.message}`);
  const [storageKey, storageValue] = [...store].find(([key]) => key.endsWith("-auth-token"));
  return { client, userId: data.user.id, storageKey, storageValue };
}

export function getOwner() {
  ownerPromise ??= signInOwner();
  return ownerPromise;
}

function assertTestDate(date) {
  if (!date.startsWith(`${TEST_YEAR}-`)) {
    throw new Error(`Refusing to touch ${date}: e2e data must stay in ${TEST_YEAR}.`);
  }
}

function check({ data, error }, action) {
  if (error) throw new Error(`${action} failed: ${error.message}`);
  return data;
}

export async function getDayRows(date) {
  assertTestDate(date);
  const { client } = await getOwner();
  const [day, mealLogs, extras] = await Promise.all([
    client.from(TABLES.DAYS).select("*").eq("date", date).maybeSingle(),
    client.from(TABLES.MEAL_LOGS).select("*").eq("date", date),
    client.from(TABLES.EXTRAS).select("*").eq("date", date).order("created_at"),
  ]);
  return {
    day: check(day, "Reading day"),
    mealLogs: check(mealLogs, "Reading meal logs"),
    extras: check(extras, "Reading extras"),
  };
}

export async function getMealLog(date, mealKey) {
  const { mealLogs } = await getDayRows(date);
  return mealLogs.find((log) => log.meal_key === mealKey) ?? null;
}

export async function listPhotoNames(date) {
  assertTestDate(date);
  const { client, userId } = await getOwner();
  const files = check(
    await client.storage
      .from(PHOTO_BUCKET)
      .list(`${userId}/${date}`, { limit: STORAGE_LIST_LIMIT }),
    `Listing photos for ${date}`,
  );
  return files.map((file) => file.name);
}

async function deleteTestYearPhotos() {
  const { client, userId } = await getOwner();
  const bucket = client.storage.from(PHOTO_BUCKET);
  const folders = check(
    await bucket.list(userId, { limit: STORAGE_LIST_LIMIT }),
    "Listing photo folders",
  );
  const testDates = folders
    .map((folder) => folder.name)
    .filter((name) => name.startsWith(`${TEST_YEAR}-`));
  const paths = [];
  for (const date of testDates) {
    for (const name of await listPhotoNames(date)) paths.push(`${userId}/${date}/${name}`);
  }
  if (paths.length > 0) check(await bucket.remove(paths), "Removing test photos");
  return paths.length;
}

// Removes every test-year day (meal logs and extras cascade) and every test-year photo.
export async function deleteTestYearData() {
  const { client } = await getOwner();
  const removedPhotos = await deleteTestYearPhotos();
  const removedDays = check(
    await client
      .from(TABLES.DAYS)
      .delete()
      .gte("date", TEST_YEAR_FIRST_DAY)
      .lte("date", TEST_YEAR_LAST_DAY)
      .select("date"),
    "Deleting test days",
  );
  return { removedDays: removedDays.length, removedPhotos };
}

export async function countTestYearRows() {
  const { client } = await getOwner();
  const entries = await Promise.all(
    Object.values(TABLES).map(async (table) => {
      const { count, error } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .gte("date", TEST_YEAR_FIRST_DAY)
        .lte("date", TEST_YEAR_LAST_DAY);
      if (error) throw new Error(`Counting ${table} failed: ${error.message}`);
      return [table, count];
    }),
  );
  return Object.fromEntries(entries);
}
