import { MEAL_STATUS } from "../config.js";
import { getDayEntries, getMealTitle } from "./day-entries.js";

const CSV_COLUMNS = Object.freeze([
  "date",
  "workout_day",
  "meal",
  "status",
  "planned_food",
  "substitute",
  "note",
  "has_photo",
]);
const LINE_BREAK = "\r\n";
const FIELD_SEPARATOR = ",";
const FOOD_SEPARATOR = "; ";
const EXTRA_MEAL_NAME = "Extra";
const EXTRA_STATUS = "extra";
const YES = "yes";
const NO = "no";
const NEEDS_QUOTING = /[",\r\n]/;
// Spreadsheet apps run a cell that starts with one of these as a formula.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const FORMULA_GUARD = "'";

const yesNo = (value) => (value ? YES : NO);

// Free text is prefixed with a quote so Excel and Sheets show it as text, never run it as a formula.
// Then RFC 4180: wrap in quotes when the field has a comma, quote or line break; double inner quotes.
function escapeField(value) {
  const raw = String(value ?? "");
  const text = FORMULA_TRIGGER.test(raw) ? FORMULA_GUARD + raw : raw;
  return NEEDS_QUOTING.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toLine(row) {
  return CSV_COLUMNS.map((column) => escapeField(row[column])).join(FIELD_SEPARATOR);
}

function getMealRow(date, isWorkout, { meal, log, status }) {
  return {
    date,
    workout_day: yesNo(isWorkout),
    meal: getMealTitle(meal),
    status,
    planned_food: meal.foods.join(FOOD_SEPARATOR),
    substitute: status === MEAL_STATUS.SUBSTITUTED ? log.substitute_text : "",
    note: log?.note,
    has_photo: yesNo(log?.photo_path),
  };
}

// The description of an unplanned extra goes in the substitute column: it is what was eaten.
function getExtraRow(date, isWorkout, extra) {
  return {
    date,
    workout_day: yesNo(isWorkout),
    meal: EXTRA_MEAL_NAME,
    status: EXTRA_STATUS,
    planned_food: "",
    substitute: extra.description,
    note: extra.note,
    has_photo: yesNo(extra.photo_path),
  };
}

export function buildCsv({ days, mealLogs, extras }) {
  const rows = getDayEntries({ days, mealLogs, extras }).flatMap((entry) => {
    const { date, is_workout: isWorkout } = entry.day;
    return [
      ...entry.meals.map((mealEntry) => getMealRow(date, isWorkout, mealEntry)),
      ...entry.extras.map((extra) => getExtraRow(date, isWorkout, extra)),
    ];
  });
  return [CSV_COLUMNS.join(FIELD_SEPARATOR), ...rows.map(toLine)].join(LINE_BREAK) + LINE_BREAK;
}
