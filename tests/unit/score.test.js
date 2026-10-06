import { describe, expect, it } from "vitest";
import { MEAL_STATUS } from "../../src/config.js";
import { MEAL_PLAN } from "../../src/plan/meal-plan.js";
import {
  SHADE_LEVEL,
  SHADE_LOW_MAX,
  SHADE_MID_MAX,
  getDayProgress,
  getDayScore,
  getRequiredMeals,
  getShadeLevel,
  getStreak,
  getVisibleMeals,
} from "../../src/lib/score.js";

const REST_REQUIRED_KEYS = ["meal-1", "meal-2", "meal-5"];
const WORKOUT_REQUIRED_KEYS = ["meal-1", "meal-2", "meal-3", "meal-4", "meal-5"];
const SNACK_KEY = "bedtime-snack";

const keysOf = (meals) => meals.map((meal) => meal.key);
const restDay = { plan_snapshot: MEAL_PLAN, is_workout: false };
const workoutDay = { plan_snapshot: MEAL_PLAN, is_workout: true };

function logs(status, keys) {
  return keys.map((meal_key) => ({ meal_key, status }));
}

describe("getVisibleMeals", () => {
  it("hides workout-only meals on a rest day but keeps the optional snack", () => {
    expect(keysOf(getVisibleMeals(MEAL_PLAN, false))).toEqual([
      "meal-1",
      "meal-2",
      "meal-5",
      SNACK_KEY,
    ]);
  });

  it("shows every meal in plan order on a workout day", () => {
    expect(keysOf(getVisibleMeals(MEAL_PLAN, true))).toEqual([...WORKOUT_REQUIRED_KEYS, SNACK_KEY]);
  });

  it("uses the snapshot it is given, not the live plan", () => {
    const oldPlan = { meals: [MEAL_PLAN.meals[0]], footerNotes: [] };
    expect(keysOf(getVisibleMeals(oldPlan, true))).toEqual(["meal-1"]);
  });
});

describe("getRequiredMeals", () => {
  it("excludes the optional snack and workout meals on a rest day", () => {
    expect(keysOf(getRequiredMeals(MEAL_PLAN, false))).toEqual(REST_REQUIRED_KEYS);
  });

  it("includes workout meals but still excludes the optional snack on a workout day", () => {
    expect(keysOf(getRequiredMeals(MEAL_PLAN, true))).toEqual(WORKOUT_REQUIRED_KEYS);
  });
});

describe("getDayProgress", () => {
  it("counts done and substituted required meals, ignoring optional, hidden and pending ones", () => {
    const mealLogs = [
      ...logs(MEAL_STATUS.DONE, ["meal-1"]),
      ...logs(MEAL_STATUS.SUBSTITUTED, ["meal-2"]),
      ...logs(MEAL_STATUS.PENDING, ["meal-5"]),
      ...logs(MEAL_STATUS.DONE, [SNACK_KEY, "meal-3"]),
    ];
    const progress = getDayProgress(restDay, mealLogs);
    expect(progress.done).toBe(2);
    expect(progress.required).toBe(REST_REQUIRED_KEYS.length);
    expect(progress.score).toBeCloseTo(2 / 3);
  });

  it("uses the workout day's larger required list", () => {
    const progress = getDayProgress(workoutDay, logs(MEAL_STATUS.DONE, WORKOUT_REQUIRED_KEYS));
    expect(progress).toEqual({ done: 5, required: 5, score: 1 });
  });

  it("scores a day with no required meals as 0 instead of dividing by zero", () => {
    const emptyPlan = { ...MEAL_PLAN, meals: [] };
    expect(getDayProgress({ plan_snapshot: emptyPlan, is_workout: false }, [])).toEqual({
      done: 0,
      required: 0,
      score: 0,
    });
  });
});

describe("getDayScore", () => {
  it("is 0 with no logs", () => {
    expect(getDayScore(restDay, [])).toBe(0);
  });

  it("counts done meals against required meals on a rest day", () => {
    expect(getDayScore(restDay, logs(MEAL_STATUS.DONE, ["meal-1"]))).toBeCloseTo(1 / 3);
  });

  it("counts substituted meals as done", () => {
    const mealLogs = [
      { meal_key: "meal-1", status: MEAL_STATUS.DONE },
      { meal_key: "meal-2", status: MEAL_STATUS.SUBSTITUTED },
    ];
    expect(getDayScore(restDay, mealLogs)).toBeCloseTo(2 / 3);
  });

  it("does not count pending meals", () => {
    const mealLogs = [
      { meal_key: "meal-1", status: MEAL_STATUS.DONE },
      { meal_key: "meal-2", status: MEAL_STATUS.PENDING },
    ];
    expect(getDayScore(restDay, mealLogs)).toBeCloseTo(1 / 3);
  });

  it("is 1 when all rest-day required meals are done", () => {
    expect(getDayScore(restDay, logs(MEAL_STATUS.DONE, REST_REQUIRED_KEYS))).toBe(1);
  });

  it("is not 1 on a workout day when only the rest-day meals are done", () => {
    expect(getDayScore(workoutDay, logs(MEAL_STATUS.DONE, REST_REQUIRED_KEYS))).toBeCloseTo(3 / 5);
  });

  it("is 1 on a workout day when all five required meals are done", () => {
    expect(getDayScore(workoutDay, logs(MEAL_STATUS.DONE, WORKOUT_REQUIRED_KEYS))).toBe(1);
  });

  it("ignores the optional snack: done snack adds nothing", () => {
    const mealLogs = logs(MEAL_STATUS.DONE, [SNACK_KEY]);
    expect(getDayScore(restDay, mealLogs)).toBe(0);
  });

  it("ignores the optional snack: skipping it does not lower a full score", () => {
    expect(getDayScore(restDay, logs(MEAL_STATUS.DONE, REST_REQUIRED_KEYS))).toBe(1);
  });

  it("ignores hidden workout meals that were ticked before the toggle was turned off", () => {
    const mealLogs = logs(MEAL_STATUS.DONE, ["meal-1", "meal-3", "meal-4"]);
    expect(getDayScore(restDay, mealLogs)).toBeCloseTo(1 / 3);
  });

  it("keeps hidden workout meal data counting again when the toggle is back on", () => {
    const mealLogs = logs(MEAL_STATUS.DONE, ["meal-1", "meal-3", "meal-4"]);
    expect(getDayScore(workoutDay, mealLogs)).toBeCloseTo(3 / 5);
  });

  it("does not double count duplicate logs for the same meal", () => {
    const mealLogs = logs(MEAL_STATUS.DONE, ["meal-1", "meal-1", "meal-1"]);
    expect(getDayScore(restDay, mealLogs)).toBeCloseTo(1 / 3);
  });

  it("ignores logs for meal keys that are not in the day's snapshot", () => {
    expect(getDayScore(restDay, logs(MEAL_STATUS.DONE, ["meal-99"]))).toBe(0);
  });

  it("scores against the day's own snapshot when the plan has changed", () => {
    const oldPlan = { meals: MEAL_PLAN.meals.slice(0, 2), footerNotes: [] };
    const day = { plan_snapshot: oldPlan, is_workout: false };
    expect(getDayScore(day, logs(MEAL_STATUS.DONE, ["meal-1", "meal-2"]))).toBe(1);
  });

  it("is 0 rather than NaN when a snapshot has no required meals", () => {
    const day = { plan_snapshot: { meals: [], footerNotes: [] }, is_workout: false };
    expect(getDayScore(day, [])).toBe(0);
  });
});

describe("getShadeLevel", () => {
  it("exposes the bucket thresholds as thirds", () => {
    expect(SHADE_LOW_MAX).toBeCloseTo(1 / 3);
    expect(SHADE_MID_MAX).toBeCloseTo(2 / 3);
  });

  it("maps null (no data) to level 0", () => {
    expect(getShadeLevel(null)).toBe(SHADE_LEVEL.NONE);
  });

  it("maps a score of 0 to level 0", () => {
    expect(getShadeLevel(0)).toBe(SHADE_LEVEL.NONE);
  });

  it("maps a tiny positive score to level 1", () => {
    expect(getShadeLevel(0.01)).toBe(SHADE_LEVEL.LOW);
  });

  it("keeps exactly 1/3 in level 1", () => {
    expect(getShadeLevel(1 / 3)).toBe(SHADE_LEVEL.LOW);
  });

  it("moves just above 1/3 to level 2", () => {
    expect(getShadeLevel(1 / 3 + 0.001)).toBe(SHADE_LEVEL.MID);
  });

  it("keeps exactly 2/3 in level 2", () => {
    expect(getShadeLevel(2 / 3)).toBe(SHADE_LEVEL.MID);
  });

  it("moves just above 2/3 to level 3", () => {
    expect(getShadeLevel(2 / 3 + 0.001)).toBe(SHADE_LEVEL.HIGH);
  });

  it("keeps 4 of 5 meals (0.8) in level 3", () => {
    expect(getShadeLevel(4 / 5)).toBe(SHADE_LEVEL.HIGH);
  });

  it("keeps 0.999 in level 3", () => {
    expect(getShadeLevel(0.999)).toBe(SHADE_LEVEL.HIGH);
  });

  it("maps exactly 1 to level 4", () => {
    expect(getShadeLevel(1)).toBe(SHADE_LEVEL.FULL);
  });

  it("matches real scores: 1 of 3 required meals is level 1, 2 of 3 is level 2", () => {
    const oneOfThree = getDayScore(restDay, logs(MEAL_STATUS.DONE, ["meal-1"]));
    const twoOfThree = getDayScore(restDay, logs(MEAL_STATUS.DONE, ["meal-1", "meal-2"]));
    expect(getShadeLevel(oneOfThree)).toBe(SHADE_LEVEL.LOW);
    expect(getShadeLevel(twoOfThree)).toBe(SHADE_LEVEL.MID);
  });
});

describe("getStreak", () => {
  const TODAY = "2026-10-06";

  it("is 0 with no data", () => {
    expect(getStreak({}, TODAY)).toBe(0);
  });

  it("counts today and earlier consecutive full days", () => {
    const scores = { "2026-10-06": 1, "2026-10-05": 1, "2026-10-04": 1 };
    expect(getStreak(scores, TODAY)).toBe(3);
  });

  it("keeps yesterday's streak alive while today has no score yet", () => {
    const scores = { "2026-10-05": 1, "2026-10-04": 1 };
    expect(getStreak(scores, TODAY)).toBe(2);
  });

  it("keeps yesterday's streak alive while today is only partly done", () => {
    const scores = { "2026-10-06": 0.5, "2026-10-05": 1, "2026-10-04": 1 };
    expect(getStreak(scores, TODAY)).toBe(2);
  });

  it("is 0 when yesterday and today are both incomplete", () => {
    const scores = { "2026-10-06": 0.5, "2026-10-05": 0.9, "2026-10-04": 1 };
    expect(getStreak(scores, TODAY)).toBe(0);
  });

  it("is 0 when the last full day was two days ago", () => {
    expect(getStreak({ "2026-10-04": 1 }, TODAY)).toBe(0);
  });

  it("stops at the first gap", () => {
    const scores = { "2026-10-06": 1, "2026-10-05": 1, "2026-10-03": 1, "2026-10-02": 1 };
    expect(getStreak(scores, TODAY)).toBe(2);
  });

  it("stops at a partly done day in the middle", () => {
    const scores = { "2026-10-06": 1, "2026-10-05": 0.8, "2026-10-04": 1 };
    expect(getStreak(scores, TODAY)).toBe(1);
  });

  it("counts across month and year boundaries", () => {
    const scores = { "2027-01-01": 1, "2026-12-31": 1, "2026-12-30": 1 };
    expect(getStreak(scores, "2027-01-01")).toBe(3);
  });

  it("ignores future dates after today", () => {
    const scores = { "2026-10-07": 1, "2026-10-06": 1 };
    expect(getStreak(scores, TODAY)).toBe(1);
  });
});
