import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

test.describe("M14 accessibility smoke", () => {
  for (const route of ["/", "/sign-in", "/sign-up", "/dashboard", "/dashboard/knowledge", "/dashboard/workflows", "/dashboard/integrations"]) {
    test(`has no serious or critical axe violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const results = await new AxeBuilder({ page: page as unknown as import("playwright-core").Page }).analyze();
      const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
      expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
    });
  }

  test("public pages remain usable at a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});
