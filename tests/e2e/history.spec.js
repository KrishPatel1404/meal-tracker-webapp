import { getDayRows } from "./support/owner-db.js";
import { TEST_DATE, expect, expectSaved, mealCheckbox, test } from "./support/fixtures.js";

const YESTERDAY = "2001-03-06";
const gridCell = (page, date) => page.locator(`.contrib__cell[data-date="${date}"]`);
const statValue = (page, label) =>
  page.locator(".stat-tile", { hasText: label }).locator(".stat-tile__value");

test("history shades logged days, and tapping a square opens that day for editing", async ({
  app: page,
}) => {
  for (const meal of ["Meal 1", "Meal 2", "Meal 5"]) await mealCheckbox(page, meal).click();
  await expectSaved(page);

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  const today = gridCell(page, TEST_DATE);
  await expect(today).toHaveAttribute("data-level", "4");
  await expect(today).toHaveAttribute("aria-current", "date");
  await expect(today).toHaveAccessibleName("Wed 7 Mar: 3 of 3 meals");
  await expect(gridCell(page, YESTERDAY)).toHaveAttribute("data-level", "0");
  await expect(gridCell(page, YESTERDAY)).toHaveAccessibleName("Tue 6 Mar: nothing logged");
  await expect(statValue(page, "Current streak")).toHaveText("1 day");
  await expect(statValue(page, "Days logged")).toHaveText("1");
  await expect(today, "the grid opens scrolled to the newest week").toBeInViewport();

  await gridCell(page, YESTERDAY).click();
  await expect(page.getByRole("heading", { name: "Tue 6 Mar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to today" })).toBeVisible();
  await mealCheckbox(page, "Meal 1").click();
  await expectSaved(page);
  await expect
    .poll(async () => (await getDayRows(YESTERDAY)).mealLogs.map((log) => log.status))
    .toEqual(["done"]);

  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByRole("heading", { name: "Mon 5 Mar" })).toBeVisible();
  await page.getByRole("button", { name: "Back to today" }).click();
  await expect(page.getByRole("heading", { name: "Today's plate" })).toBeVisible();
  await expect(mealCheckbox(page, "Meal 2")).toHaveAttribute("aria-checked", "true");

  // From the day before today, the next-day arrow lands back on today's plate.
  await page.getByRole("button", { name: "History" }).click();
  await gridCell(page, YESTERDAY).click();
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: "Today's plate" })).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  await expect(gridCell(page, YESTERDAY)).toHaveAttribute("data-level", "1");
  await expect(gridCell(page, YESTERDAY)).toHaveAccessibleName("Tue 6 Mar: 1 of 3 meals");
  await expect(statValue(page, "Days logged")).toHaveText("2");
  await expect(statValue(page, "Current streak")).toHaveText("1 day");

  await page.getByRole("button", { name: "Back to today" }).click();
  await expect(page.getByRole("heading", { name: "Today's plate" })).toBeVisible();
});
