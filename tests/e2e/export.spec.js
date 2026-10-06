import { readFile } from "node:fs/promises";
import {
  TEST_DATE,
  expandMeal,
  expect,
  expectSaved,
  mealCheckbox,
  test,
} from "./support/fixtures.js";

const WEEK_START = "2001-03-01";
const CSV_HEADER = "date,workout_day,meal,status,planned_food,substitute,note,has_photo";
const PDF_MAGIC = "%PDF-";

// Without a share sheet the app falls back to a plain download, which Playwright can catch.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "canShare", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true });
  });
});

async function logSomeMeals(page) {
  await mealCheckbox(page, "Meal 1").click();
  const card = await expandMeal(page, "Meal 1");
  await card.getByRole("button", { name: "Note" }).click();
  await card.getByLabel("Note", { exact: true }).fill('Toast first, then "eggs"');
  await card.getByLabel("Note", { exact: true }).blur();
  await page.getByRole("button", { name: "Add food" }).click();
  await page.getByRole("textbox", { name: "What did you have?" }).fill("Apple");
  await page.getByRole("textbox", { name: "What did you have?" }).blur();
  await expectSaved(page);
}

async function exportAs(page, buttonName) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: buttonName }).click();
  const download = await downloadPromise;
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}

test("CSV and PDF exports download the logged week", async ({ app: page }) => {
  await logSomeMeals(page);
  await page.getByRole("button", { name: "Export" }).click();
  const sheet = page.getByRole("dialog", { name: "Export your meals" });
  await expect(sheet.getByRole("button", { name: "Last 7 days" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const csv = await exportAs(page, "Export CSV");
  expect(csv.name).toBe(`meal-log_${WEEK_START}_to_${TEST_DATE}.csv`);
  const lines = csv.bytes.toString("utf8").split("\r\n");
  expect(lines).toEqual([
    CSV_HEADER,
    `${TEST_DATE},no,Meal 1,done,3 whole eggs with 150 ml egg whites; 3 slices of toast,,"Toast first, then ""eggs""",no`,
    expect.stringMatching(new RegExp(`^${TEST_DATE},no,Meal 2,pending,`)),
    expect.stringMatching(new RegExp(`^${TEST_DATE},no,Meal 5,pending,`)),
    expect.stringMatching(new RegExp(`^${TEST_DATE},no,Bedtime snack \\(Optional\\),pending,`)),
    `${TEST_DATE},no,Extra,extra,,Apple,,no`,
    "",
  ]);

  const pdf = await exportAs(page, "Export PDF");
  expect(pdf.name).toBe(`meal-log_${WEEK_START}_to_${TEST_DATE}.pdf`);
  expect(pdf.bytes.subarray(0, PDF_MAGIC.length).toString("latin1")).toBe(PDF_MAGIC);
  expect(pdf.bytes.length, "the PDF has real content").toBeGreaterThan(2000);
  await expect(sheet.getByRole("status")).toHaveText("");
});

test("exporting dates with nothing logged says so instead of downloading", async ({
  app: page,
}) => {
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  await page.getByRole("button", { name: "Export" }).click();
  const sheet = page.getByRole("dialog", { name: "Export your meals" });
  await sheet.getByLabel("From").fill("2001-01-01");
  await sheet.getByLabel("To").fill("2001-01-02");
  await expect(sheet.getByRole("button", { name: "Last 7 days" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await sheet.getByRole("button", { name: "Export CSV" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Nothing logged in those dates.");

  await sheet.getByLabel("From").fill("2001-01-05");
  await sheet.getByRole("button", { name: "Export PDF" }).click();
  await expect(sheet.getByRole("status")).toHaveText(
    "The start date needs to be on or before the end date.",
  );
  expect(downloads).toBe(0);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});
