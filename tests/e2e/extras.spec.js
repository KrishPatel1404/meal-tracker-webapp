import { getDayRows, listPhotoNames } from "./support/owner-db.js";
import { TEST_DATE, createTestPhoto, expect, expectSaved, test } from "./support/fixtures.js";

const extraRows = (page) => page.locator(".extra-row");
const descriptionField = (row) => row.getByRole("textbox", { name: "What did you have?" });
const noteField = (row) => row.getByRole("textbox", { name: "Note (optional)" });

test("extra food can be added, edited, given a photo and removed", async ({ app: page }) => {
  await page.getByRole("button", { name: "Add food" }).click();
  const row = extraRows(page).first();
  await expect(descriptionField(row), "the new row is ready to type into").toBeFocused();
  await expectSaved(page);
  const [created] = (await getDayRows(TEST_DATE)).extras;
  expect(created, "Add food creates the row right away").toBeTruthy();

  await descriptionField(row).fill("Banana, 2 small");
  await noteField(row).fill('After the "long" run');
  await noteField(row).blur();
  await expectSaved(page);
  await expect
    .poll(async () => (await getDayRows(TEST_DATE)).extras)
    .toEqual([
      expect.objectContaining({
        id: created.id,
        description: "Banana, 2 small",
        note: 'After the "long" run',
      }),
    ]);

  await row
    .locator('input[type="file"]')
    .setInputFiles(await createTestPhoto(page, { width: 800, height: 1200 }));
  await expect(row.locator(".photo-thumb__img")).toHaveAttribute("src", /token=/, {
    timeout: 20_000,
  });
  await expectSaved(page);
  await expect
    .poll(async () => (await getDayRows(TEST_DATE)).extras[0].photo_path)
    .toMatch(new RegExp(`/${TEST_DATE}/${created.id}\\.(webp|jpg)$`));

  await page.reload();
  const reloaded = extraRows(page).first();
  await expect(descriptionField(reloaded)).toHaveValue("Banana, 2 small");
  await expect(noteField(reloaded)).toHaveValue('After the "long" run');
  // Photo URLs are signed only once the thumbnail is on screen.
  const reloadedThumb = reloaded.locator(".photo-thumb__img");
  await reloadedThumb.scrollIntoViewIfNeeded();
  await expect(reloadedThumb).toHaveAttribute("src", /token=/);

  await reloaded.getByRole("button", { name: "Remove this food" }).click();
  await reloaded.getByRole("button", { name: "Keep" }).click();
  await expect(extraRows(page)).toHaveCount(1);
  expect((await getDayRows(TEST_DATE)).extras).toHaveLength(1);

  await reloaded.getByRole("button", { name: "Remove this food" }).click();
  await reloaded.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(extraRows(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add food" })).toBeFocused();
  await expectSaved(page);
  expect((await getDayRows(TEST_DATE)).extras).toEqual([]);
  expect(await listPhotoNames(TEST_DATE), "removing the food removes its photo").toEqual([]);
});

const EXTRAS_INSERT_URL = "**/rest/v1/extras*";
const INSERT_DELAY_MS = 2_000;
const INSERT_FAILED_TEXT = "Couldn't save this food yet. What you typed is kept.";
const isInsert = (route) => route.request().method() === "POST";

test("Add food focuses the new description synchronously in the tap", async ({ app: page }) => {
  const focusedInTap = await page.getByRole("button", { name: "Add food" }).evaluate((button) => {
    button.click();
    const focused = document.activeElement;
    return { isInput: focused?.matches('.extra-row [data-field="description"]') ?? false };
  });
  expect(focusedInTap.isInput, "iOS only opens the keyboard if focus lands inside the tap").toBe(
    true,
  );
});

test("text typed before the insert returns is still saved", async ({ app: page }) => {
  await page.route(EXTRAS_INSERT_URL, async (route) => {
    if (!isInsert(route)) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, INSERT_DELAY_MS));
    return route.continue();
  });

  await page.getByRole("button", { name: "Add food" }).click();
  const row = extraRows(page).first();
  await descriptionField(row).fill("Typed while saving");
  expect(
    (await getDayRows(TEST_DATE)).extras,
    "the insert is still held back, so nothing is saved yet",
  ).toEqual([]);

  await expect
    .poll(async () => (await getDayRows(TEST_DATE)).extras, { timeout: 20_000 })
    .toEqual([expect.objectContaining({ description: "Typed while saving" })]);
  await expectSaved(page);
  await expect(descriptionField(row)).toHaveValue("Typed while saving");
  await expect(
    row.locator('input[type="file"]'),
    "photo appears once the row exists",
  ).toBeAttached();
});

test("a failed insert keeps the typed text and can be retried", async ({ app: page }) => {
  await page.route(EXTRAS_INSERT_URL, (route) =>
    isInsert(route) ? route.abort("failed") : route.continue(),
  );

  await page.getByRole("button", { name: "Add food" }).click();
  const row = extraRows(page).first();
  await descriptionField(row).fill("Kept after failure");
  await descriptionField(row).blur();
  await expect(row.getByRole("alert")).toContainText(INSERT_FAILED_TEXT);
  await expect(descriptionField(row)).toHaveValue("Kept after failure");
  expect((await getDayRows(TEST_DATE)).extras).toEqual([]);

  await page.unroute(EXTRAS_INSERT_URL);
  await row.getByRole("button", { name: "Retry" }).click();
  await expect(row.getByRole("alert")).toBeHidden();
  await expectSaved(page);
  await expect
    .poll(async () => (await getDayRows(TEST_DATE)).extras)
    .toEqual([expect.objectContaining({ description: "Kept after failure" })]);
});
