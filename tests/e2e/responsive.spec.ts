import { expect, test } from "./fixtures";

test.describe("M14 responsive smoke", () => {
  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 900 }, { width: 1280, height: 900 }]) {
    test(`landing and auth surfaces fit at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /business automation with a local ai core/i })).toBeVisible();
      await page.goto("/sign-in");
      await expect(page.getByLabel("Email")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });
  }
});
