import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

test("operations and settings surfaces keep workspace controls explicit", async ({ page, testUser }) => {
  await signUp(page, testUser);
  await page.goto("/dashboard/operations");
  await expect(page.getByRole("heading", { name: /see how the workspace is running/i })).toBeVisible();
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: /keep the boundary clear/i })).toBeVisible();
  await expect(page.getByText(/no workspace selected/i)).toBeVisible();
});
