import { describe, expect, it } from "vitest";
import { MEAL_STATUS } from "../../src/config.js";
import { getDayEntries, getRangeTotals } from "../../src/export/day-entries.js";
import { MEAL_PLAN } from "../../src/plan/meal-plan.js";

const REST_DATE = "2001-03-04";
const WORKOUT_DATE = "2001-03-05";

const restDay = { date: REST_DATE, is_workout: false, plan_snapshot: MEAL_PLAN };
const workoutDay = { date: WORKOUT_DATE, is_workout: true, plan_snapshot: MEAL_PLAN };

const mealLog = (date, mealKey, status) => ({ date, meal_key: mealKey, status });
const extra = (date) => ({ date, description: "Apple", note: null, photo_path: null });

describe("getRangeTotals", () => {
  it("is all zeros for no entries", () => {
    expect(getRangeTotals([])).toEqual({
      workoutDays: 0,
      mealsEaten: 0,
      mealsRequired: 0,
      swaps: 0,
      extras: 0,
    });
  });

  it("adds up workouts, required meals, swaps and extras across days", () => {
    const entries = getDayEntries({
      days: [restDay, workoutDay],
      mealLogs: [
        mealLog(REST_DATE, "meal-1", MEAL_STATUS.DONE),
        mealLog(REST_DATE, "meal-2", MEAL_STATUS.SUBSTITUTED),
        mealLog(WORKOUT_DATE, "meal-3", MEAL_STATUS.DONE),
        mealLog(WORKOUT_DATE, "meal-5", MEAL_STATUS.PENDING),
      ],
      extras: [extra(REST_DATE), extra(WORKOUT_DATE), extra(WORKOUT_DATE)],
    });

    // Rest day: 3 required meals, workout day: 5.
    expect(getRangeTotals(entries)).toEqual({
      workoutDays: 1,
      mealsEaten: 3,
      mealsRequired: 8,
      swaps: 1,
      extras: 3,
    });
  });

  it("counts a swapped optional snack as a swap but not as a required meal", () => {
    const entries = getDayEntries({
      days: [restDay],
      mealLogs: [mealLog(REST_DATE, "bedtime-snack", MEAL_STATUS.SUBSTITUTED)],
      extras: [],
    });
    const totals = getRangeTotals(entries);
    expect(totals.swaps).toBe(1);
    expect(totals.mealsEaten).toBe(0);
    expect(totals.mealsRequired).toBe(3);
  });
});
