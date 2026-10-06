import { MEAL_STATUS } from "../config.js";
import { shiftDate } from "./day.js";

// Shade bucket upper bounds (inclusive) as a share of required meals done.
export const SHADE_LOW_MAX = 1 / 3;
export const SHADE_MID_MAX = 2 / 3;
export const SHADE_LEVEL = Object.freeze({ NONE: 0, LOW: 1, MID: 2, HIGH: 3, FULL: 4 });

const FULL_SCORE = 1;
const COUNTED_STATUSES = new Set([MEAL_STATUS.DONE, MEAL_STATUS.SUBSTITUTED]);

export function getVisibleMeals(planSnapshot, isWorkout) {
  return planSnapshot.meals.filter((meal) => isWorkout || !meal.workoutOnly);
}

export function getRequiredMeals(planSnapshot, isWorkout) {
  return getVisibleMeals(planSnapshot, isWorkout).filter((meal) => !meal.optional);
}

// Required meals eaten (done or substituted) out of the day's required meals, plus the 0..1 score.
export function getDayProgress(day, mealLogs) {
  const required = getRequiredMeals(day.plan_snapshot, day.is_workout);
  const requiredKeys = new Set(required.map((meal) => meal.key));
  const doneKeys = new Set(
    mealLogs
      .filter((log) => requiredKeys.has(log.meal_key) && COUNTED_STATUSES.has(log.status))
      .map((log) => log.meal_key),
  );
  const score = required.length === 0 ? 0 : doneKeys.size / required.length;
  return { done: doneKeys.size, required: required.length, score };
}

export function getShadeLevel(score) {
  if (score === null || score <= 0) return SHADE_LEVEL.NONE;
  if (score <= SHADE_LOW_MAX) return SHADE_LEVEL.LOW;
  if (score <= SHADE_MID_MAX) return SHADE_LEVEL.MID;
  if (score < FULL_SCORE) return SHADE_LEVEL.HIGH;
  return SHADE_LEVEL.FULL;
}

function isComplete(scoresByDate, date) {
  return (scoresByDate[date] ?? 0) >= FULL_SCORE;
}

// Streak = consecutive days with every required meal done, ending today (or yesterday if today isn't complete yet).
export function getStreak(scoresByDate, today) {
  let date = isComplete(scoresByDate, today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (isComplete(scoresByDate, date)) {
    streak += 1;
    date = shiftDate(date, -1);
  }
  return streak;
}
