import { getDayRows, getMealLog } from "./support/owner-db.js";
import {
  REST_DAY_MEALS,
  SECRET_LINK_PATH,
  TEST_DATE,
  TEST_DATE_LABEL,
  WORKOUT_DAY_MEALS,
  expandMeal,
  expect,
  expectSaved,
  mealCard,
  mealCheckbox,
  test,
} from "./support/fixtures.js";

// The meal log upsert (POST); the first one is aborted like a dropped connection.
const MEAL_LOGS_REST = /\/rest\/v1\/meal_logs/;
const POST = "POST";

async function failNextMealLogSave(page) {
  let failed = false;
  await page.route(MEAL_LOGS_REST, (route) => {
    if (failed || route.request().method() !== POST) return route.fallback();
    failed = true;
    return route.abort("internetdisconnected");
  });
}

// Ticks a meal while its save is dropped: the tick stays, the pill says so, nothing is stored.
async function tickWithFailedSave(page, mealName, mealKey) {
  await failNextMealLogSave(page);
  await mealCheckbox(page, mealName).click();
  await expect(page.locator(".save-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator(".save-status")).toHaveText("Couldn't save");
  await expect(mealCheckbox(page, mealName), "the tick is kept for the retry").toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(await getMealLog(TEST_DATE, mealKey), "the dropped save stored nothing").toBeNull();
}

const visibleMealTitles = (page) =>
  page
    .locator("article.meal-card:visible")
    .getByRole("checkbox")
    .evaluateAll((boxes) =>
      boxes.map((box) => box.getAttribute("aria-label").replace(/ eaten$/, "")),
    );

test("the secret link signs in, strips the token from the URL and shows today's plate", async ({
  page,
}) => {
  await page.goto(SECRET_LINK_PATH);

  await expect(page.getByRole("heading", { name: "Today's plate" })).toBeVisible();
  await expect(mealCheckbox(page, "Meal 1"), "the day finishes loading").toBeVisible();
  expect(page.url(), "the token must not stay in the address bar").not.toContain("#k=");
  await expect(page.locator(".app-header .chip")).toHaveText(TEST_DATE_LABEL);
  await expect(page.locator(".app-header .chip .icon--calendar")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "History" }).locator(".icon--history"),
    "history has its own icon, not the date chip's calendar",
  ).toHaveCount(1);
  expect(await visibleMealTitles(page)).toEqual(REST_DAY_MEALS);
  await expect(page.locator(".section-heading__meta")).toHaveText("0 of 3 eaten");
  await expect(page.locator(".page-footer")).toContainText("Meals can be eaten in any order");
  await expect(page.getByRole("switch", { name: /Workout day/ })).not.toBeChecked();

  const { day } = await getDayRows(TEST_DATE);
  expect(day, "just opening the app must not create a day").toBeNull();
});

test("ticking meals saves straight away and survives a reload", async ({ app: page }) => {
  await mealCheckbox(page, "Meal 1").click();
  await mealCheckbox(page, "Meal 5").click();

  await expect(mealCheckbox(page, "Meal 1")).toHaveAttribute("aria-checked", "true");
  await expect(mealCard(page, "Meal 1")).toHaveClass(/meal-card--done/);
  await expect(page.locator(".section-heading__meta")).toHaveText("2 of 3 eaten");
  await expectSaved(page);

  const { day, mealLogs } = await getDayRows(TEST_DATE);
  expect(day.is_workout).toBe(false);
  expect(day.plan_snapshot.meals.map((meal) => meal.key)).toContain("meal-1");
  expect(Object.fromEntries(mealLogs.map((log) => [log.meal_key, log.status]))).toEqual({
    "meal-1": "done",
    "meal-5": "done",
  });

  await page.reload();
  await expect(mealCheckbox(page, "Meal 1")).toHaveAttribute("aria-checked", "true");
  await expect(mealCheckbox(page, "Meal 5")).toHaveAttribute("aria-checked", "true");
  await expect(mealCheckbox(page, "Meal 2")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".section-heading__meta")).toHaveText("2 of 3 eaten");

  await mealCheckbox(page, "Meal 5").click();
  await expectSaved(page);
  await expect.poll(async () => (await getMealLog(TEST_DATE, "meal-5"))?.status).toBe("pending");
  await expect(page.locator(".section-heading__meta")).toHaveText("1 of 3 eaten");
});

test("'Ate something else' marks the meal substituted and keeps the text", async ({
  app: page,
}) => {
  const card = await expandMeal(page, "Meal 2");
  await card.getByRole("button", { name: "Ate something else" }).click();
  const substitute = card.getByLabel("What did you eat instead?");
  await expect(substitute).toBeFocused();
  await substitute.fill("Sushi bowl");

  await expect(mealCheckbox(page, "Meal 2")).toHaveAttribute("aria-checked", "true");
  await expect(card).toHaveClass(/meal-card--substituted/);
  await expect(card.locator(".tag--substitute")).toHaveText("Something else");
  await expect(card.locator(".meal-card__substitute")).toHaveText("Sushi bowl");

  // Debounced save, no blur: the text must still reach the database.
  await expect
    .poll(() => getMealLog(TEST_DATE, "meal-2"))
    .toMatchObject({ status: "substituted", substitute_text: "Sushi bowl" });
  await expectSaved(page);

  await page.reload();
  const reloaded = mealCard(page, "Meal 2");
  await expect(reloaded).toHaveClass(/meal-card--substituted/);
  await expect(reloaded.locator(".meal-card__substitute")).toHaveText("Sushi bowl");
  await expect(page.locator(".section-heading__meta")).toHaveText("1 of 3 eaten");

  // Unticking keeps the text but the meal goes back to pending.
  await mealCheckbox(page, "Meal 2").click();
  await expectSaved(page);
  await expect
    .poll(() => getMealLog(TEST_DATE, "meal-2"))
    .toMatchObject({ status: "pending", substitute_text: "Sushi bowl" });
});

test("a note saves on blur and comes back after a reload", async ({ app: page }) => {
  const card = await expandMeal(page, "Meal 1");
  await card.getByRole("button", { name: "Note" }).click();
  const note = card.getByLabel("Note", { exact: true });
  await note.fill("Swapped toast for bagel, still tasty");
  await note.blur();

  await expectSaved(page);
  const log = await getMealLog(TEST_DATE, "meal-1");
  expect(log, "a note alone saves without ticking the meal").toMatchObject({
    note: "Swapped toast for bagel, still tasty",
    status: "pending",
  });

  await page.reload();
  const reloaded = await expandMeal(page, "Meal 1");
  await expect(reloaded.getByLabel("Note", { exact: true })).toHaveValue(
    "Swapped toast for bagel, still tasty",
  );
});

test("the workout toggle shows and hides meals 3 and 4 and keeps their data", async ({
  app: page,
}) => {
  const workoutSwitch = page.getByRole("switch", { name: /Workout day/ });

  await page.locator("label.switch").click();
  await expect(workoutSwitch).toBeChecked();
  expect(await visibleMealTitles(page)).toEqual(WORKOUT_DAY_MEALS);
  await expect(page.locator(".section-heading__meta")).toHaveText("0 of 5 eaten");

  await mealCheckbox(page, "Meal 3").click();
  await expect(page.locator(".section-heading__meta")).toHaveText("1 of 5 eaten");
  await expectSaved(page);
  expect((await getDayRows(TEST_DATE)).day.is_workout).toBe(true);

  await page.locator("label.switch").click();
  await expect(workoutSwitch).not.toBeChecked();
  expect(await visibleMealTitles(page)).toEqual(REST_DAY_MEALS);
  await expect(page.locator(".section-heading__meta")).toHaveText("0 of 3 eaten");
  await expectSaved(page);
  expect((await getDayRows(TEST_DATE)).day.is_workout).toBe(false);
  expect((await getMealLog(TEST_DATE, "meal-3"))?.status, "hidden meals keep their data").toBe(
    "done",
  );

  await page.reload();
  await expect(workoutSwitch).not.toBeChecked();
  await page.locator("label.switch").click();
  await expect(mealCheckbox(page, "Meal 3")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".section-heading__meta")).toHaveText("1 of 5 eaten");
  await expectSaved(page);
});

test("a dropped save is sent again with the next change", async ({ app: page }) => {
  await tickWithFailedSave(page, "Meal 1", "meal-1");

  await mealCheckbox(page, "Meal 5").click();
  await expectSaved(page);
  const { mealLogs } = await getDayRows(TEST_DATE);
  expect(Object.fromEntries(mealLogs.map((log) => [log.meal_key, log.status]))).toEqual({
    "meal-1": "done",
    "meal-5": "done",
  });
  await expect(page.locator(".section-heading__meta")).toHaveText("2 of 3 eaten");

  await page.reload();
  await expect(mealCheckbox(page, "Meal 1")).toHaveAttribute("aria-checked", "true");
  await expect(mealCheckbox(page, "Meal 5")).toHaveAttribute("aria-checked", "true");
});

test("leaving the day sends a dropped save instead of losing it, and the next day starts clean", async ({
  app: page,
}) => {
  await tickWithFailedSave(page, "Meal 1", "meal-1");

  await page.getByRole("button", { name: "History" }).click();
  await expect
    .poll(async () => (await getMealLog(TEST_DATE, "meal-1"))?.status, {
      message: "the retry on leaving the day reaches the database",
    })
    .toBe("done");

  await page.getByRole("button", { name: "Back to today" }).click();
  await expect(mealCheckbox(page, "Meal 1")).toHaveAttribute("aria-checked", "true");
  await expect(
    page.locator(".save-status"),
    'the old "Couldn\'t save" does not follow you to the next view',
  ).not.toHaveAttribute("data-state", "error");
  await expect(page.locator(".section-heading__meta")).toHaveText("1 of 3 eaten");
});

test("a dropped save is sent again when the connection comes back", async ({
  app: page,
  context,
}) => {
  await tickWithFailedSave(page, "Meal 2", "meal-2");

  await context.setOffline(true);
  await context.setOffline(false);
  await expectSaved(page);
  expect((await getMealLog(TEST_DATE, "meal-2"))?.status).toBe("done");
  await expect(page.locator(".section-heading__meta")).toHaveText("1 of 3 eaten");
});
