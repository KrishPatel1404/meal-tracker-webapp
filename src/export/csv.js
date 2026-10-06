import { MEAL_STATUS } from "../config.js";
import { formatWeekday } from "../lib/day.js";
import {
  EXTRA_LABEL,
  getDayEntries,
  getDayTypeLabel,
  getMealTitle,
  STATUS_LABEL,
} from "./day-entries.js";

const CSV_COLUMNS = Object.freeze([
  "Date",
  "Day",
  "Day type",
  "Meal",
  "Status",
  "What I ate",
  "Planned food",
  "Note",
  "Photo",
]);
// Excel only reads a CSV as UTF-8 (so "½" and accents survive) when it starts with a byte order mark.
const UTF8_BOM = "﻿";
const LINE_BREAK = "\r\n";
const FIELD_SEPARATOR = ",";
const FOOD_SEPARATOR = "; ";
const YES = "Yes";
const NO = "No";
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

function getDayColumns(day) {
  return {
    Date: day.date,
    Day: formatWeekday(day.date),
    "Day type": getDayTypeLabel(day.is_workout),
  };
}

const EATEN_FOOD = Object.freeze({
  [MEAL_STATUS.DONE]: ({ meal }) => meal.foods.join(FOOD_SEPARATOR),
  [MEAL_STATUS.SUBSTITUTED]: ({ log }) => log.substitute_text,
  [MEAL_STATUS.PENDING]: () => "",
});

function getMealRow(day, mealEntry) {
  const { meal, log, status } = mealEntry;
  return {
    ...getDayColumns(day),
    Meal: getMealTitle(meal),
    Status: STATUS_LABEL[status],
    "What I ate": EATEN_FOOD[status](mealEntry),
    "Planned food": meal.foods.join(FOOD_SEPARATOR),
    Note: log?.note,
    Photo: yesNo(log?.photo_path),
  };
}

function getExtraRow(day, extra) {
  return {
    ...getDayColumns(day),
    Meal: EXTRA_LABEL,
    Status: EXTRA_LABEL,
    "What I ate": extra.description,
    "Planned food": "",
    Note: extra.note,
    Photo: yesNo(extra.photo_path),
  };
}

// One row per meal or extra, oldest day first.
export function buildCsv({ days, mealLogs, extras }) {
  const rows = getDayEntries({ days, mealLogs, extras }).flatMap((entry) => [
    ...entry.meals.map((mealEntry) => getMealRow(entry.day, mealEntry)),
    ...entry.extras.map((extra) => getExtraRow(entry.day, extra)),
  ]);
  const lines = [CSV_COLUMNS.join(FIELD_SEPARATOR), ...rows.map(toLine)];
  return UTF8_BOM + lines.join(LINE_BREAK) + LINE_BREAK;
}
