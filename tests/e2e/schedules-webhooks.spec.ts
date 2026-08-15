import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

test("schedule and webhook surfaces expose safe setup guidance", async ({ page, testUser }) => {
  await signUp(page, testUser);
  await page.goto("/dashboard/schedules");
  await expect(page.getByRole("heading", { name: /put durable work on a clock/i })).toBeVisible();
  await page.goto("/dashboard/webhooks");
  await expect(page.getByRole("heading", { name: /receive signed workflow triggers/i })).toBeVisible();
  await expect(page.getByText(/select a workspace first/i)).toBeVisible();
});
