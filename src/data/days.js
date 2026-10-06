import {
  DAY_CONFLICT_COLUMNS,
  MEAL_LOG_CONFLICT_COLUMNS,
  RANGE_PAGE_SIZE,
  TABLES,
} from "../config.js";
import { MEAL_PLAN, PLAN_VERSION } from "../plan/meal-plan.js";
import { LoadError, SaveError, unwrap } from "./errors.js";
import { supabase } from "./supabase.js";

const LOAD_MESSAGE = "Couldn't load your meals.";
const SAVE_MESSAGE = "Couldn't save that.";

// Each table's sort is unique per row, so pages never skip or repeat rows.
const RANGE_ORDER = Object.freeze({
  [TABLES.DAYS]: ["date"],
  [TABLES.MEAL_LOGS]: ["date", "meal_key"],
  [TABLES.EXTRAS]: ["date", "created_at", "id"],
});

// Creates the day with the current plan snapshot if missing. Never touches an existing day.
export async function ensureDay(date) {
  const result = await supabase
    .from(TABLES.DAYS)
    .upsert(
      { date, plan_version: PLAN_VERSION, plan_snapshot: MEAL_PLAN },
      { onConflict: DAY_CONFLICT_COLUMNS, ignoreDuplicates: true },
    );
  unwrap(result, SaveError, SAVE_MESSAGE);
}

export async function getDay(date) {
  const [days, mealLogs, extras] = await Promise.all([
    supabase.from(TABLES.DAYS).select("*").eq("date", date).maybeSingle(),
    supabase.from(TABLES.MEAL_LOGS).select("*").eq("date", date),
    supabase.from(TABLES.EXTRAS).select("*").eq("date", date).order("created_at"),
  ]);
  return {
    day: unwrap(days, LoadError, LOAD_MESSAGE),
    mealLogs: unwrap(mealLogs, LoadError, LOAD_MESSAGE),
    extras: unwrap(extras, LoadError, LOAD_MESSAGE),
  };
}

function selectRangePage(table, fromDate, toDate, offset) {
  const query = RANGE_ORDER[table].reduce(
    (ordered, column) => ordered.order(column),
    supabase.from(table).select("*").gte("date", fromDate).lte("date", toDate),
  );
  return query.range(offset, offset + RANGE_PAGE_SIZE - 1);
}

// PostgREST caps each response, so read the range page by page until a short page.
async function selectAllInRange(table, fromDate, toDate) {
  const rows = [];
  for (let offset = 0; ; offset += RANGE_PAGE_SIZE) {
    const result = await selectRangePage(table, fromDate, toDate, offset);
    const page = unwrap(result, LoadError, LOAD_MESSAGE);
    rows.push(...page);
    if (page.length < RANGE_PAGE_SIZE) return rows;
  }
}

export async function getDaysInRange(fromDate, toDate) {
  const [days, mealLogs, extras] = await Promise.all(
    [TABLES.DAYS, TABLES.MEAL_LOGS, TABLES.EXTRAS].map((table) =>
      selectAllInRange(table, fromDate, toDate),
    ),
  );
  return { days, mealLogs, extras };
}

export async function setWorkout(date, isWorkout) {
  await ensureDay(date);
  const result = await supabase
    .from(TABLES.DAYS)
    .update({ is_workout: isWorkout })
    .eq("date", date);
  unwrap(result, SaveError, SAVE_MESSAGE);
}

export async function upsertMealLog(date, mealKey, fields) {
  await ensureDay(date);
  const result = await supabase
    .from(TABLES.MEAL_LOGS)
    .upsert({ date, meal_key: mealKey, ...fields }, { onConflict: MEAL_LOG_CONFLICT_COLUMNS });
  unwrap(result, SaveError, SAVE_MESSAGE);
}
