import { isTypedError } from "../data/errors.js";
import { getDay, setWorkout } from "../data/days.js";
import { formatDayLabel, getLogicalDate, getNextResetTime, shiftDate } from "../lib/day.js";
import { getDayProgress, getVisibleMeals } from "../lib/score.js";
import { MEAL_PLAN } from "../plan/meal-plan.js";
import { SHARED_COPY } from "./copy.js";
import { h, icon } from "./dom.js";
import { openExportSheet } from "./export-sheet.js";
import { createExtrasList } from "./extras-list.js";
import { createMealCard } from "./meal-card.js";
import {
  createSaveQueue,
  createSaveStatus,
  flushPendingSaves,
  retryFailedSaves,
  settleSave,
} from "./save-status.js";

const COPY = Object.freeze({
  TODAY_TITLE: "Today's plate",
  HISTORY: "History",
  EXPORT: "Export",
  PREVIOUS_DAY: "Previous day",
  NEXT_DAY: "Next day",
  WORKOUT_LABEL: "Workout day",
  WORKOUT_HINT: "Adds preworkout and post workout meals",
  MEALS_HEADING: "Meals",
  EXTRAS_HEADING: "Extras",
  LOAD_FALLBACK: "Couldn't load your meals.",
  TRY_AGAIN: "Try again",
});

const SKELETON_CARD_COUNT = 4;
const HIDDEN_STATE = "hidden";
const VISIBLE_STATE = "visible";

function createIconButton(iconName, label, onclick) {
  return h("button", { type: "button", class: "icon-button", "aria-label": label, onclick }, [
    icon(iconName),
  ]);
}

function createSkeleton() {
  return Array.from({ length: SKELETON_CARD_COUNT }, () =>
    h("div", { class: "card meal-card meal-card--skeleton", "aria-hidden": "true" }),
  );
}

function createWorkoutSwitch(isWorkout, onchange) {
  const input = h("input", {
    class: "switch__input visually-hidden",
    type: "checkbox",
    role: "switch",
    onchange,
  });
  input.checked = isWorkout;
  const label = h("label", { class: "card switch" }, [
    h("span", { class: "switch__text" }, [
      h("span", { class: "switch__label" }, COPY.WORKOUT_LABEL),
      h("span", { class: "switch__hint" }, COPY.WORKOUT_HINT),
    ]),
    input,
    h("span", { class: "switch__track", "aria-hidden": "true" }),
  ]);
  return { label, input };
}

export function mountDayView(root, { date, onChangeDate, onOpenHistory }) {
  const today = getLogicalDate();
  const isToday = date === today;
  let active = true;
  let resetTimerId = null;

  const goToToday = () => onChangeDate(getLogicalDate());

  const header = h("header", { class: "app-header" }, [
    h("div", { class: "app-header__bar" }, [
      h("div", { class: "app-header__chips" }, [
        isToday
          ? h("span", { class: "chip" }, [icon("calendar", { small: true }), formatDayLabel(date)])
          : h("button", { type: "button", class: "chip chip--accent", onclick: goToToday }, [
              SHARED_COPY.BACK_TO_TODAY,
            ]),
      ]),
      h("div", { class: "app-header__actions" }, [
        createSaveStatus(),
        createIconButton("history", COPY.HISTORY, onOpenHistory),
        createIconButton("share", COPY.EXPORT, () => openExportSheet()),
      ]),
    ]),
  ]);

  const title = isToday
    ? h("h1", { class: "page-title" }, COPY.TODAY_TITLE)
    : h("div", { class: "date-nav" }, [
        createIconButton("chevron-left", COPY.PREVIOUS_DAY, () =>
          onChangeDate(shiftDate(date, -1)),
        ),
        h("h1", { class: "date-nav__label" }, formatDayLabel(date)),
        createIconButton("chevron-right", COPY.NEXT_DAY, () => onChangeDate(shiftDate(date, 1))),
      ]);
  const page = h("div", { class: "page" }, [title]);

  function showContent(...nodes) {
    page.replaceChildren(title, ...nodes);
  }

  function renderDay({ day, mealLogs, extras }) {
    const plan = day?.plan_snapshot ?? MEAL_PLAN;
    const logsByKey = new Map(mealLogs.map((log) => [log.meal_key, log]));
    const enqueueWorkoutWrite = createSaveQueue();
    let isWorkout = day?.is_workout ?? false;
    let savedWorkout = isWorkout;

    const progress = h("span", { class: "section-heading__meta" });
    const cards = plan.meals.map((meal) => ({
      meal,
      card: createMealCard({
        date,
        meal,
        log: logsByKey.get(meal.key),
        onSaved: (log) => {
          logsByKey.set(meal.key, log);
          renderProgress();
        },
      }),
    }));

    function renderProgress() {
      const { done, required } = getDayProgress({ plan_snapshot: plan, is_workout: isWorkout }, [
        ...logsByKey.values(),
      ]);
      progress.textContent = `${done} of ${required} ${SHARED_COPY.EATEN_SUFFIX}`;
    }

    // Hidden meals keep their data; they just leave the list and the score.
    function applyWorkout(nextIsWorkout) {
      isWorkout = nextIsWorkout;
      const visibleKeys = new Set(getVisibleMeals(plan, isWorkout).map((meal) => meal.key));
      for (const { meal, card } of cards) card.hidden = !visibleKeys.has(meal.key);
      renderProgress();
    }

    // Sends the switch's latest value when it differs from the server; also the failed-write retry.
    async function writeWorkout() {
      const next = isWorkout;
      if (next === savedWorkout) return;
      const { saved } = await settleSave(setWorkout(date, next), persistWorkout);
      if (saved) savedWorkout = next;
    }

    function persistWorkout() {
      return enqueueWorkoutWrite(writeWorkout);
    }

    function onWorkoutChange() {
      applyWorkout(workout.input.checked);
      persistWorkout();
    }

    const workout = createWorkoutSwitch(isWorkout, onWorkoutChange);
    applyWorkout(isWorkout);

    showContent(
      workout.label,
      h("h2", { class: "section-heading" }, [COPY.MEALS_HEADING, progress]),
      ...cards.map(({ card }) => card),
      h("h2", { class: "section-heading" }, COPY.EXTRAS_HEADING),
      createExtrasList({ date, extras }),
      h(
        "footer",
        { class: "page-footer" },
        plan.footerNotes.map((footerNote) => h("p", {}, footerNote)),
      ),
    );
  }

  function renderLoadError(error) {
    showContent(
      h("div", { class: "card field" }, [
        h("p", { role: "alert" }, error.message || COPY.LOAD_FALLBACK),
        h("button", { type: "button", class: "btn btn--secondary btn--block", onclick: load }, [
          COPY.TRY_AGAIN,
        ]),
      ]),
    );
  }

  async function load() {
    showContent(...createSkeleton());
    page.setAttribute("aria-busy", "true");
    try {
      const data = await getDay(date);
      if (active) renderDay(data);
    } catch (error) {
      if (!isTypedError(error)) throw error;
      if (active) renderLoadError(error);
    } finally {
      page.removeAttribute("aria-busy");
    }
  }

  function scheduleRollover() {
    clearTimeout(resetTimerId);
    resetTimerId = setTimeout(checkRollover, getNextResetTime() - Date.now());
  }

  // 3am rollover: when the logical day moves on, open the new today.
  function checkRollover() {
    const logicalToday = getLogicalDate();
    if (logicalToday !== date) {
      onChangeDate(logicalToday);
      return;
    }
    scheduleRollover();
  }

  function onVisibilityChange() {
    if (document.visibilityState === HIDDEN_STATE) flushPendingSaves();
    if (document.visibilityState === VISIBLE_STATE && isToday) checkRollover();
  }

  // Leaving the day sends typed text and failed writes first. A write that fails again stays
  // on the retry list (and in the header pill) instead of being dropped with this view.
  function unmount() {
    active = false;
    flushPendingSaves();
    clearTimeout(resetTimerId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", flushPendingSaves);
    window.removeEventListener("online", retryFailedSaves);
    header.remove();
    page.remove();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", flushPendingSaves);
  window.addEventListener("online", retryFailedSaves);
  if (isToday) scheduleRollover();

  root.append(header, page);
  load();
  return unmount;
}
