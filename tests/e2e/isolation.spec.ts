import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

test("workspace-scoped surfaces do not render resource data without a selected workspace", async ({ page, testUser }) => {
  await signUp(page, testUser);
  await page.goto("/dashboard/brands");
  await expect(page.getByText(/no workspace yet/i)).toBeVisible();
  await expect(page.getByText("M14 isolation sentinel", { exact: true })).toHaveCount(0);
  await page.goto("/dashboard/knowledge");
  await expect(page.getByText(/create a workspace first/i)).toBeVisible();
});
