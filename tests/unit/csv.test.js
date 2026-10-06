import { describe, expect, it } from "vitest";
import { MEAL_STATUS } from "../../src/config.js";
import { buildCsv } from "../../src/export/csv.js";
import { MEAL_PLAN } from "../../src/plan/meal-plan.js";

const HEADER = "date,workout_day,meal,status,planned_food,substitute,note,has_photo";
const CRLF = "\r\n";
const REST_DATE = "2001-03-04";
const WORKOUT_DATE = "2001-03-05";

const restDay = { date: REST_DATE, is_workout: false, plan_snapshot: MEAL_PLAN };
const workoutDay = { date: WORKOUT_DATE, is_workout: true, plan_snapshot: MEAL_PLAN };
const emptyData = { days: [], mealLogs: [], extras: [] };

function mealLog(date, mealKey, fields) {
  return {
    date,
    meal_key: mealKey,
    status: MEAL_STATUS.PENDING,
    substitute_text: null,
    note: null,
    photo_path: null,
    ...fields,
  };
}

// Plain split is fine for assertions on rows that contain no quoted line breaks.
const linesOf = (csv) => csv.split(CRLF).slice(0, -1);
const mealRowsOf = (csv, prefix) => linesOf(csv).filter((line) => line.startsWith(prefix));

describe("buildCsv", () => {
  it("returns only the header for an empty range", () => {
    expect(buildCsv(emptyData)).toBe(HEADER + CRLF);
  });

  it("writes one row per visible meal on a rest day, hiding workout-only meals", () => {
    const rows = linesOf(buildCsv({ days: [restDay], mealLogs: [], extras: [] })).slice(1);
    expect(rows.map((row) => row.split(",")[2])).toEqual([
      "Meal 1",
      "Meal 2",
      "Meal 5",
      "Bedtime snack (Optional)",
    ]);
    expect(rows.every((row) => row.startsWith(`${REST_DATE},no,`))).toBe(true);
    expect(rows.join("\n")).not.toContain("Preworkout");
  });

  it("writes workout meals on a workout day and flags the day", () => {
    const csv = buildCsv({ days: [workoutDay], mealLogs: [], extras: [] });
    expect(mealRowsOf(csv, `${WORKOUT_DATE},yes,`)).toHaveLength(MEAL_PLAN.meals.length);
    expect(csv).toContain("Meal 3 (Preworkout)");
    expect(csv).toContain("Meal 4 (Post workout)");
  });

  it("reports unlogged meals as pending and ignores logs of hidden meals", () => {
    const hiddenLog = mealLog(REST_DATE, "meal-3", { status: MEAL_STATUS.DONE });
    const csv = buildCsv({ days: [restDay], mealLogs: [hiddenLog], extras: [] });
    expect(csv).not.toContain("Meal 3");
    expect(mealRowsOf(csv, REST_DATE).every((row) => row.includes(",pending,"))).toBe(true);
  });

  it("joins planned foods with '; ' and quotes them because they contain commas or text", () => {
    const csv = buildCsv({ days: [restDay], mealLogs: [], extras: [] });
    const meal1 = mealRowsOf(csv, REST_DATE)[0];
    expect(meal1).toBe(
      `${REST_DATE},no,Meal 1,pending,3 whole eggs with 150 ml egg whites; 3 slices of toast,,,no`,
    );
  });

  it("keeps substitute text only for substituted meals and marks photos", () => {
    const logs = [
      mealLog(REST_DATE, "meal-1", {
        status: MEAL_STATUS.SUBSTITUTED,
        substitute_text: "Pancakes",
        photo_path: "u/2001-03-04/meal-1.jpg",
      }),
      mealLog(REST_DATE, "meal-2", {
        status: MEAL_STATUS.DONE,
        substitute_text: "stale text",
        note: "felt great",
      }),
    ];
    const rows = mealRowsOf(buildCsv({ days: [restDay], mealLogs: logs, extras: [] }), REST_DATE);
    expect(rows[0]).toMatch(/,substituted,.*; 3 slices of toast,Pancakes,,yes$/);
    expect(rows[1]).toMatch(/,done,.*,,felt great,no$/);
    expect(rows[1]).not.toContain("stale text");
  });

  it("escapes quotes, commas and line breaks per RFC 4180", () => {
    const logs = [
      mealLog(REST_DATE, "meal-1", {
        status: MEAL_STATUS.SUBSTITUTED,
        substitute_text: 'Toast, "sourdough"',
        note: "line one\nline two",
      }),
    ];
    const csv = buildCsv({ days: [restDay], mealLogs: logs, extras: [] });
    expect(csv).toContain('"Toast, ""sourdough"""');
    expect(csv).toContain('"line one\nline two"');
  });

  it("prefixes free text that starts like a formula so spreadsheets show it as text", () => {
    const logs = [
      mealLog(REST_DATE, "meal-1", {
        status: MEAL_STATUS.SUBSTITUTED,
        substitute_text: "=1+1",
        note: '=HYPERLINK("http://evil.test","x")',
      }),
      mealLog(REST_DATE, "meal-2", { status: MEAL_STATUS.DONE, note: "+44 call back" }),
      mealLog(REST_DATE, "meal-5", { status: MEAL_STATUS.DONE, note: "-2kg, nice" }),
    ];
    const extras = [
      { date: REST_DATE, description: "@SUM(1+1)", note: "\tsneaky", photo_path: null },
      { date: REST_DATE, description: "Apple = good", note: "a-ok", photo_path: null },
    ];
    const rows = mealRowsOf(buildCsv({ days: [restDay], mealLogs: logs, extras }), REST_DATE);
    expect(rows[0], "substitute and note guarded").toMatch(
      /,'=1\+1,"'=HYPERLINK\(""http:\/\/evil\.test"",""x""\)",no$/,
    );
    expect(rows[1], "leading plus guarded").toMatch(/,'\+44 call back,no$/);
    expect(rows[2], "leading minus guarded, then quoted for the comma").toMatch(
      /,"'-2kg, nice",no$/,
    );
    const extraRows = mealRowsOf(buildCsv({ days: [restDay], mealLogs: [], extras }), REST_DATE);
    expect(extraRows.slice(-2), "only a leading trigger is guarded").toEqual([
      `${REST_DATE},no,Extra,extra,,'@SUM(1+1),'\tsneaky,no`,
      `${REST_DATE},no,Extra,extra,,Apple = good,a-ok,no`,
    ]);
  });

  it("adds one extra row per extra with the description and note", () => {
    const extras = [
      { date: REST_DATE, description: "Ice cream", note: "after dinner", photo_path: "p.jpg" },
      { date: REST_DATE, description: "Apple", note: null, photo_path: null },
    ];
    const csv = buildCsv({ days: [restDay], mealLogs: [], extras });
    expect(mealRowsOf(csv, `${REST_DATE},no,Extra,`)).toEqual([
      `${REST_DATE},no,Extra,extra,,Ice cream,after dinner,yes`,
      `${REST_DATE},no,Extra,extra,,Apple,,no`,
    ]);
  });

  it("orders days oldest first and keeps each day's extras with that day", () => {
    const extras = [{ date: REST_DATE, description: "Cake", note: "", photo_path: null }];
    const csv = buildCsv({ days: [workoutDay, restDay], mealLogs: [], extras });
    const dates = linesOf(csv)
      .slice(1)
      .map((row) => row.slice(0, REST_DATE.length));
    expect(dates).toEqual([...dates].sort());
    expect(csv.indexOf(`${REST_DATE},no,Extra`)).toBeLessThan(csv.indexOf(WORKOUT_DATE));
  });

  it("uses each day's own plan snapshot, not the current plan", () => {
    const oldPlan = {
      ...MEAL_PLAN,
      meals: [
        {
          key: "old",
          name: "Old meal",
          label: "",
          foods: ["x"],
          notes: [],
          workoutOnly: false,
          optional: false,
        },
      ],
    };
    const csv = buildCsv({
      days: [{ ...restDay, plan_snapshot: oldPlan }],
      mealLogs: [],
      extras: [],
    });
    expect(linesOf(csv)).toEqual([HEADER, `${REST_DATE},no,Old meal,pending,x,,,no`]);
  });
});
