import { expect, test } from "./fixtures";

test("landing page exposes the Flowyn product heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /business automation with a local ai core/i })).toBeVisible();
});
