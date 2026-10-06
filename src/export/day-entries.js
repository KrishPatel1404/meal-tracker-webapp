import { MEAL_STATUS } from "../config.js";
import { groupByDate } from "../lib/day.js";
import { getDayProgress, getVisibleMeals } from "../lib/score.js";

// Plain-English labels shared by the CSV and PDF exports.
export const STATUS_LABEL = Object.freeze({
  [MEAL_STATUS.DONE]: "Ate as planned",
  [MEAL_STATUS.SUBSTITUTED]: "Ate something else",
  [MEAL_STATUS.PENDING]: "Not ticked",
});
export const EXTRA_LABEL = "Extra";
const DAY_TYPE_LABEL = Object.freeze({ WORKOUT: "Workout", REST: "Rest" });

export const getDayTypeLabel = (isWorkout) =>
  isWorkout ? DAY_TYPE_LABEL.WORKOUT : DAY_TYPE_LABEL.REST;

export function getMealTitle(meal) {
  return meal.label ? `${meal.name} (${meal.label})` : meal.name;
}

// Joins the three tables into one entry per day, oldest first. Each day lists the meals
// visible on that day (from its own plan snapshot), so hidden meals never reach an export.
export function getDayEntries({ days, mealLogs, extras }) {
  const logsByDate = groupByDate(mealLogs);
  const extrasByDate = groupByDate(extras);
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const dayLogs = logsByDate.get(day.date) ?? [];
      const logsByKey = new Map(dayLogs.map((log) => [log.meal_key, log]));
      const meals = getVisibleMeals(day.plan_snapshot, day.is_workout).map((meal) => {
        const log = logsByKey.get(meal.key) ?? null;
        return { meal, log, status: log?.status ?? MEAL_STATUS.PENDING };
      });
      return {
        day,
        progress: getDayProgress(day, dayLogs),
        meals,
        extras: extrasByDate.get(day.date) ?? [],
      };
    });
}

const countSwaps = (meals) =>
  meals.filter(({ status }) => status === MEAL_STATUS.SUBSTITUTED).length;

// Totals across logged days. Meals eaten counts required meals (done or swapped), like the day score.
export function getRangeTotals(entries) {
  return entries.reduce(
    (totals, { day, progress, meals, extras }) => ({
      workoutDays: totals.workoutDays + (day.is_workout ? 1 : 0),
      mealsEaten: totals.mealsEaten + progress.done,
      mealsRequired: totals.mealsRequired + progress.required,
      swaps: totals.swaps + countSwaps(meals),
      extras: totals.extras + extras.length,
    }),
    { workoutDays: 0, mealsEaten: 0, mealsRequired: 0, swaps: 0, extras: 0 },
  );
}

// Every meal across the entries' plan snapshots, in first-seen order, as the latest snapshot has it.
export function getPlanMeals(entries) {
  const mealsByKey = new Map();
  for (const { day } of entries) {
    for (const meal of day.plan_snapshot.meals) {
      mealsByKey.set(meal.key, meal);
    }
  }
  return [...mealsByKey.values()];
}
