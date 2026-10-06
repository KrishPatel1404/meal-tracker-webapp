import { DAY_RESET_HOUR } from "../config.js";

const DATE_PAD_LENGTH = 2;
const DATE_LOCALE = "en-GB";
const WEEKDAY_FORMAT = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "short" });
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat(DATE_LOCALE, { day: "numeric", month: "short" });
const DAY_MONTH_YEAR_FORMAT = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function pad(value) {
  return String(value).padStart(DATE_PAD_LENGTH, "0");
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Wall-clock based (not "now minus 3h") so it stays consistent with getNextResetTime on DST days.
export function getLogicalDate(now = new Date()) {
  const calendarDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const beforeReset = now.getHours() < DAY_RESET_HOUR;
  calendarDay.setDate(calendarDay.getDate() - (beforeReset ? 1 : 0));
  return formatLocalDate(calendarDay);
}

export function getNextResetTime(now = new Date()) {
  const reset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_RESET_HOUR);
  if (reset <= now) reset.setDate(reset.getDate() + 1);
  return reset;
}

export function shiftDate(dateStr, deltaDays) {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + deltaDays);
  return formatLocalDate(date);
}

// "Tue 6 Oct", or "Tue 6 Oct 2026" with the year.
export function formatDayLabel(dateStr, { withYear = false } = {}) {
  const date = parseLocalDate(dateStr);
  const dayMonth = (withYear ? DAY_MONTH_YEAR_FORMAT : DAY_MONTH_FORMAT).format(date);
  return `${WEEKDAY_FORMAT.format(date)} ${dayMonth}`;
}

// Map of date -> rows for that date, keeping the rows' order.
export function groupByDate(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.date)) groups.set(row.date, []);
    groups.get(row.date).push(row);
  }
  return groups;
}
