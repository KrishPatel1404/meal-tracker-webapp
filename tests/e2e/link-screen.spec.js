import { loadTestEnv } from "./support/env.js";
import { expect, mealCheckbox, test } from "./support/fixtures.js";

const { ownerToken } = loadTestEnv();

test("with no session the app asks for the secret link, and pasting it signs in", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open your secret link" })).toBeVisible();
  const linkField = page.getByLabel("Secret link");
  await expect(linkField).toHaveCSS("font-size", "16px");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText("Paste your secret link first.");
  await expect(linkField).toBeFocused();

  await linkField.fill(`${new URL(page.url()).origin}/#k=definitely-not-the-token`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "That link didn't open the app. Check it and try again.",
  );

  await linkField.fill(`${new URL(page.url()).origin}/#k=${encodeURIComponent(ownerToken)}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Today's plate" })).toBeVisible();
  await expect(mealCheckbox(page, "Meal 1")).toBeVisible();

  await page.reload();
  await expect(mealCheckbox(page, "Meal 1"), "the session survives a reload").toBeVisible();
});
