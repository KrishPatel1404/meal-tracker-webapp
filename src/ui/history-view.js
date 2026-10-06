import { HISTORY_WEEKS } from "../config.js";
import { getDaysInRange } from "../data/days.js";
import { isTypedError } from "../data/errors.js";
import {
  formatDayLabel,
  getLogicalDate,
  groupByDate,
  parseLocalDate,
  shiftDate,
} from "../lib/day.js";
import { getDayProgress, getShadeLevel, getStreak, SHADE_LEVEL } from "../lib/score.js";
import { SHARED_COPY } from "./copy.js";
import { h, icon } from "./dom.js";

const DAYS_PER_WEEK = 7;
const SUNDAY_INDEX = 0;
// A leading month label only shows when the next month label is at least this many columns away.
const MIN_MONTH_LABEL_GAP_WEEKS = 3;
const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en-GB", { month: "short" });
const SHADE_LEVELS = Object.values(SHADE_LEVEL);

const COPY = Object.freeze({
  TITLE: "History",
  LOADING: "Loading your meals...",
  LOAD_ERROR: "Couldn't load your history. Check your connection and try again.",
  RETRY: "Try again",
  STREAK: "Current streak",
  DAYS_LOGGED: "Days logged",
  RANGE_HEADING: `${HISTORY_WEEKS} weeks`,
  GRID_LABEL: `Meals over ${HISTORY_WEEKS} weeks`,
  LEGEND_LESS: "Less",
  LEGEND_MORE: "More",
  NOTHING_LOGGED: "nothing logged",
});

function getWeekdayIndex(dateStr) {
  const day = parseLocalDate(dateStr).getDay();
  return day === SUNDAY_INDEX ? DAYS_PER_WEEK - 1 : day - 1;
}

function getMondayOf(dateStr) {
  return shiftDate(dateStr, -getWeekdayIndex(dateStr));
}

// Monday of the earliest week that can still be on the grid (today's week is then the last column).
function getLoadStart(today) {
  return shiftDate(getMondayOf(today), -(HISTORY_WEEKS - 1) * DAYS_PER_WEEK);
}

// The grid starts at the week of the first logged day (or today) and fills forward from there,
// so it only rolls once there are HISTORY_WEEKS of history.
function getGridStart(days, today) {
  const firstDate = days.reduce((first, day) => (day.date < first ? day.date : first), today);
  return getMondayOf(firstDate);
}

function pluralizeDays(count) {
  return count === 1 ? "day" : "days";
}

// Map of date -> { required, done, score } for every day that has a row.
function summarizeDays({ days, mealLogs }) {
  const logsByDate = groupByDate(mealLogs);
  return new Map(
    days.map((day) => [day.date, getDayProgress(day, logsByDate.get(day.date) ?? [])]),
  );
}

function describeDay(date, summary) {
  const dayLabel = formatDayLabel(date);
  if (!summary) return `${dayLabel}: ${COPY.NOTHING_LOGGED}`;
  return `${dayLabel}: ${summary.done} of ${summary.required} meals`;
}

function createCell(date, summary, today) {
  if (date > today) {
    return h("span", { class: "contrib__cell contrib__cell--blank", "aria-hidden": "true" });
  }
  const label = describeDay(date, summary);
  return h("button", {
    type: "button",
    class: "contrib__cell",
    dataset: { date, level: String(getShadeLevel(summary?.score ?? null)) },
    "aria-label": label,
    "aria-current": date === today ? "date" : null,
    title: label,
  });
}

// One label per column that contains the 1st of a month (plus the first column when there's room).
function getMonthLabels(start) {
  const labels = [];
  for (let week = 0; week < HISTORY_WEEKS; week += 1) {
    const sunday = parseLocalDate(shiftDate(start, week * DAYS_PER_WEEK + DAYS_PER_WEEK - 1));
    if (sunday.getDate() <= DAYS_PER_WEEK) labels.push({ week, date: sunday });
  }
  if (labels.length === 0 || labels[0].week >= MIN_MONTH_LABEL_GAP_WEEKS) {
    labels.unshift({ week: 0, date: parseLocalDate(start) });
  }
  return labels;
}

function createMonthRow(start) {
  return h(
    "div",
    { class: "contrib__months", "aria-hidden": "true" },
    getMonthLabels(start).map(({ week, date }) =>
      h(
        "span",
        { class: "contrib__month", style: `grid-column: ${week + 1}` },
        MONTH_LABEL_FORMAT.format(date),
      ),
    ),
  );
}

function createGrid(start, summaries, today) {
  const cells = [];
  for (let offset = 0; offset < HISTORY_WEEKS * DAYS_PER_WEEK; offset += 1) {
    const date = shiftDate(start, offset);
    cells.push(createCell(date, summaries.get(date), today));
  }
  return h("div", { class: "contrib__grid", role: "group", "aria-label": COPY.GRID_LABEL }, cells);
}

function createLegend() {
  return h("div", { class: "contrib__legend", "aria-hidden": "true" }, [
    h("span", {}, COPY.LEGEND_LESS),
    ...SHADE_LEVELS.map((level) => h("span", { class: "contrib__cell", dataset: { level } })),
    h("span", {}, COPY.LEGEND_MORE),
  ]);
}

function createStatTile(label, value, unit) {
  return h("div", { class: "card stat-tile" }, [
    h("span", { class: "stat-tile__label" }, label),
    h("span", { class: "stat-tile__value" }, [
      String(value),
      unit ? " " : null,
      unit ? h("span", { class: "stat-tile__unit" }, unit) : null,
    ]),
  ]);
}

function createStats(summaries, today) {
  const scoresByDate = Object.fromEntries(
    [...summaries].map(([date, summary]) => [date, summary.score]),
  );
  const streak = getStreak(scoresByDate, today);
  return h("div", { class: "stat-grid" }, [
    createStatTile(COPY.STREAK, streak, pluralizeDays(streak)),
    createStatTile(COPY.DAYS_LOGGED, summaries.size),
  ]);
}

function scrollToToday(scroller) {
  const todayCell = scroller.querySelector('[aria-current="date"]');
  const overflow = todayCell.getBoundingClientRect().right - scroller.getBoundingClientRect().right;
  if (overflow > 0) scroller.scrollLeft += overflow;
}

function createHeader(onBackClick, signal) {
  const backButton = h(
    "button",
    { type: "button", class: "icon-button", "aria-label": SHARED_COPY.BACK_TO_TODAY },
    [icon("chevron-left")],
  );
  backButton.addEventListener("click", onBackClick, { signal });
  return h("header", { class: "app-header" }, [
    h("div", { class: "app-header__bar" }, [
      h("div", { class: "app-header__chips" }, [backButton]),
    ]),
  ]);
}

export function mountHistoryView(root, { onOpenDay, onBack }) {
  const controller = new AbortController();
  const { signal } = controller;
  const today = getLogicalDate();
  const loadStart = getLoadStart(today);
  const title = h("h1", { class: "page-title" }, COPY.TITLE);
  const page = h("div", { class: "page" }, [title]);

  const showContent = (nodes) => page.replaceChildren(title, ...nodes);

  const showHistory = (range) => {
    const start = getGridStart(range.days, today);
    const summaries = summarizeDays(range);
    const scroller = h("div", { class: "contrib__scroll" }, [
      createMonthRow(start),
      createGrid(start, summaries, today),
    ]);
    scroller.addEventListener(
      "click",
      (event) => {
        const cell = event.target.closest("button[data-date]");
        if (cell) onOpenDay(cell.dataset.date);
      },
      { signal },
    );
    showContent([
      createStats(summaries, today),
      h("h2", { class: "section-heading" }, COPY.RANGE_HEADING),
      h("div", { class: "card contrib" }, [scroller, createLegend()]),
    ]);
    scrollToToday(scroller);
  };

  const showLoadError = (load) => {
    const retryButton = h("button", { type: "button", class: "btn btn--secondary" }, COPY.RETRY);
    retryButton.addEventListener("click", load, { signal });
    showContent([
      h("div", { class: "card field" }, [
        h("p", { class: "field__hint", role: "status" }, COPY.LOAD_ERROR),
        retryButton,
      ]),
    ]);
  };

  const load = async () => {
    showContent([h("p", { class: "field__hint", role: "status" }, COPY.LOADING)]);
    try {
      const range = await getDaysInRange(loadStart, today);
      if (signal.aborted) return;
      showHistory(range);
    } catch (error) {
      if (!isTypedError(error)) throw error;
      if (!signal.aborted) showLoadError(load);
    }
  };

  const header = createHeader(() => onBack(), signal);
  root.append(header, page);
  load();

  return () => {
    controller.abort();
    header.remove();
    page.remove();
  };
}
