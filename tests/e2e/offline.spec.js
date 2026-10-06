import { getDayRows } from "./support/owner-db.js";
import { TEST_DATE, expect, expectSaved, mealCheckbox, test } from "./support/fixtures.js";

test("going offline shows the banner and pauses every input until the connection is back", async ({
  app: page,
  context,
}) => {
  const banner = page.locator(".offline-banner");
  const meal1 = mealCheckbox(page, "Meal 1");
  await expect(banner).toBeHidden();

  await context.setOffline(true);
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText("You're offline. Changes are paused.");
  const workoutLabel = page.locator("label.switch");
  for (const control of [meal1, page.getByRole("button", { name: "Add food" }), workoutLabel]) {
    await expect(control).toHaveCSS("pointer-events", "none");
  }
  const bannerBox = await banner.boundingBox();
  expect(bannerBox.height, "banner text fits on one line").toBeLessThan(60);

  // A real tap at the checkbox's position must not reach it.
  const box = await meal1.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(meal1).toHaveAttribute("aria-checked", "false");
  const switchBox = await workoutLabel.boundingBox();
  await page.mouse.click(switchBox.x + switchBox.width / 2, switchBox.y + switchBox.height / 2);
  await expect(page.getByRole("switch", { name: /Workout day/ })).not.toBeChecked();
  expect((await getDayRows(TEST_DATE)).day, "nothing was written while offline").toBeNull();

  await context.setOffline(false);
  await expect(banner).toBeHidden();
  await meal1.click();
  await expect(meal1).toHaveAttribute("aria-checked", "true");
  await expectSaved(page);
  expect((await getDayRows(TEST_DATE)).mealLogs).toEqual([
    expect.objectContaining({ meal_key: "meal-1", status: "done" }),
  ]);
});
