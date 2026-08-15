import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

test("a new user can create an authenticated session", async ({ page, testUser }) => {
  await signUp(page, testUser);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /build your first ai workforce/i })).toBeVisible();
  await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
});
