import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

test("an owner can create a workspace and brand through the product UI", async ({ page, testRunPrefix, testUser }) => {
  await signUp(page, testUser);
  await page.goto("/dashboard/brands");
  await expect(page.getByRole("heading", { name: /make your context useful/i })).toBeVisible();

  await page.getByLabel("Workspace name").fill(`${testRunPrefix} Workspace`);
  await page.getByLabel("Workspace slug").fill(`${testRunPrefix}-workspace`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText(`${testRunPrefix} Workspace`, { exact: true })).toBeVisible();

  await page.getByLabel("Brand name").fill("M14 Test Brand");
  await page.getByLabel("Short description").fill("Synthetic browser-test context");
  await page.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByRole("heading", { name: "M14 Test Brand" })).toBeVisible();
  await expect(page.getByText("Synthetic browser-test context")).toBeVisible();
});
