import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

test("approval and integration surfaces preserve human and credential boundaries", async ({ page, testUser }) => {
  await signUp(page, testUser);
  await page.goto("/dashboard/approvals");
  await expect(page.getByRole("heading", { name: /review human gates/i })).toBeVisible();
  await page.goto("/dashboard/integrations");
  await expect(page.getByRole("heading", { name: /connect slack safely/i })).toBeVisible();
  await expect(page.getByText(/credentials are encrypted/i).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("M14-fake-slack-token");
});
