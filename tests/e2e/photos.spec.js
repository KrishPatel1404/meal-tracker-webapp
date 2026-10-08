import { getMealLog, getOwner, listPhotoNames } from "./support/owner-db.js";
import {
  TEST_DATE,
  createTestPhoto,
  expandMeal,
  expect,
  expectSaved,
  mealCard,
  test,
} from "./support/fixtures.js";

const PHOTO_MAX_EDGE_PX = 1280;
const SIGNED_URL = /\/storage\/v1\/object\/sign\/meal-photos\/.+token=/;

test("a meal photo is compressed, uploaded, shown, persisted and removable", async ({
  app: page,
}) => {
  const { userId } = await getOwner();
  const card = await expandMeal(page, "Meal 1");
  const photo = await createTestPhoto(page, { width: 2000, height: 1500 });

  await card.locator('input[type="file"]:not([capture])').setInputFiles(photo);

  const thumb = card.locator(".photo-thumb__img");
  await expect(thumb).toHaveAttribute("src", SIGNED_URL, { timeout: 20_000 });
  await expectSaved(page);

  const log = await getMealLog(TEST_DATE, "meal-1");
  expect(log.photo_path, "stored at <user>/<date>/<meal key>.<ext>").toMatch(
    new RegExp(`^${userId}/${TEST_DATE}/meal-1\\.(webp|jpg)$`),
  );
  expect(log.status, "a photo alone doesn't tick the meal").toBe("pending");
  expect(await listPhotoNames(TEST_DATE)).toEqual([log.photo_path.split("/").pop()]);

  await expect.poll(() => thumb.evaluate((img) => img.complete && img.naturalWidth)).toBeTruthy();
  const size = await thumb.evaluate((img) => [img.naturalWidth, img.naturalHeight]);
  expect(Math.max(...size), "long edge is resized before upload").toBe(PHOTO_MAX_EDGE_PX);

  await page.reload();
  const reloaded = await expandMeal(page, "Meal 1");
  await expect(reloaded.locator(".photo-thumb__img")).toHaveAttribute("src", SIGNED_URL);

  await reloaded.locator(".photo-thumb__img").click();
  const viewer = page.getByRole("dialog", { name: "Photo" });
  await expect(viewer.locator(".photo-viewer__img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  await reloaded.getByRole("button", { name: "Remove photo" }).click();
  await expect(reloaded.locator("label.photo-attach")).toBeVisible();
  await expectSaved(page);
  await expect.poll(() => listPhotoNames(TEST_DATE)).toEqual([]);
  expect((await getMealLog(TEST_DATE, "meal-1")).photo_path).toBeNull();
  await expect(mealCard(page, "Meal 1").locator(".photo-thumb")).toHaveCount(0);
});
