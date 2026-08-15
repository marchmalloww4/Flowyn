import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

test("agent and workflow surfaces expose controlled empty states", async ({ page, testUser }) => {
  await signUp(page, testUser);
  await page.goto("/dashboard/agents");
  await expect(page.getByRole("heading", { name: /keep agents controlled/i })).toBeVisible();
  await page.goto("/dashboard/workflows");
  await expect(page.getByRole("heading", { name: /compose durable work/i })).toBeVisible();
  await expect(page.getByText(/select a workspace first/i)).toBeVisible();
});
