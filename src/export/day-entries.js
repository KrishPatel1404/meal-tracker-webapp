import { MEAL_STATUS } from "../config.js";
import { groupByDate } from "../lib/day.js";
import { getDayScore, getVisibleMeals } from "../lib/score.js";

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
        score: getDayScore(day, dayLogs),
        meals,
        extras: extrasByDate.get(day.date) ?? [],
      };
    });
}
