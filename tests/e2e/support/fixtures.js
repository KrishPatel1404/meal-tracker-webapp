import { test as base, expect } from "@playwright/test";
import { loadTestEnv } from "./env.js";
import { deleteTestYearData, getOwner } from "./owner-db.js";

// Wednesday noon local time. Everything the app writes during a test lands on this date.
export const TEST_DATE = "2001-03-07";
export const TEST_DATE_LABEL = "Wed 7 Mar";
const TEST_NOW = new Date(`${TEST_DATE}T12:00:00`);

export const REST_DAY_MEALS = ["Meal 1", "Meal 2", "Meal 5", "Bedtime snack"];
export const WORKOUT_DAY_MEALS = [
  "Meal 1",
  "Meal 2",
  "Meal 3",
  "Meal 4",
  "Meal 5",
  "Bedtime snack",
];

const { ownerToken } = loadTestEnv();
export const SECRET_LINK_PATH = `/#k=${encodeURIComponent(ownerToken)}`;

export function mealCheckbox(page, mealName) {
  return page.getByRole("checkbox", { name: `${mealName} eaten` });
}

export function mealCard(page, mealName) {
  return page.locator("article.meal-card", { has: mealCheckbox(page, mealName) });
}

export async function expandMeal(page, mealName) {
  const card = mealCard(page, mealName);
  await card.getByRole("button", { name: "Show foods" }).click();
  return card;
}

// Waits until every write has landed: the header pill says "Saved".
export async function expectSaved(page) {
  await expect(page.locator(".save-status")).toHaveAttribute("data-state", "saved");
}

// A JPEG drawn by the browser itself, so the photo path runs on a real decodable image.
export async function createTestPhoto(page, { width, height }) {
  const base64 = await page.evaluate(
    async ([w, hgt]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = hgt;
      const context = canvas.getContext("2d");
      const gradient = context.createLinearGradient(0, 0, w, hgt);
      gradient.addColorStop(0, "#215cda");
      gradient.addColorStop(1, "#ce5400");
      context.fillStyle = gradient;
      context.fillRect(0, 0, w, hgt);
      return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    },
    [width, height],
  );
  return { name: "plate.jpg", mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") };
}

export const test = base.extend({
  // Fake clock in the test year, plus a clean test year before and after every test.
  testYear: [
    async ({ page }, use) => {
      await deleteTestYearData();
      await page.clock.install({ time: TEST_NOW });
      await use(TEST_DATE);
      await deleteTestYearData();
    },
    { auto: true },
  ],

  // The app, already signed in with the shared owner session and showing today's plate.
  app: async ({ page }, use) => {
    const { storageKey, storageValue } = await getOwner();
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [storageKey, storageValue],
    );
    await page.goto("/");
    await expect(mealCheckbox(page, "Meal 1")).toBeVisible();
    await use(page);
  },
});

export { expect };
