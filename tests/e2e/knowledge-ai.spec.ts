import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

test("knowledge and AI surfaces keep bounded empty states visible", async ({ page, testUser }) => {
  await signUp(page, testUser);
  await page.goto("/dashboard/knowledge");
  await expect(page.getByRole("heading", { name: /make retrieval trustworthy/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /create a workspace first/i })).toBeVisible();
  await page.goto("/dashboard/ai");
  await expect(page.getByRole("heading", { name: /generate with guardrails/i })).toBeVisible();
  await expect(page.getByText(/select a workspace first/i)).toBeVisible();
});
