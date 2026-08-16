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

test("agent setup explains brand tools and keeps them disabled until a brand is selected", async ({ page, testRunPrefix, testUser }) => {
  await signUp(page, testUser);
  await page.goto("/dashboard/brands");
  await page.getByLabel("Workspace name").fill(`${testRunPrefix} SweetBites Bakery`);
  await expect(page.getByLabel("Workspace slug")).toHaveValue(`${testRunPrefix.toLowerCase()}-sweetbites-bakery`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByLabel("Brand name").fill("SweetBites Bakery");
  await page.getByLabel("Short description").fill("Classic Chocolate Brownies");
  await page.getByRole("button", { name: "Add brand" }).click();

  await page.goto("/dashboard/agents");
  await expect(page.getByText(/Give this AI assistant a name/i)).toBeVisible();
  const searchTool = page.locator("label").filter({ hasText: "Search Brand Knowledge" }).locator("input[type=checkbox]");
  const profileTool = page.locator("label").filter({ hasText: "Get Brand Profile" }).locator("input[type=checkbox]");
  await expect(searchTool).toBeDisabled();
  await expect(profileTool).toBeDisabled();
  await page.getByLabel("Brand context").selectOption({ label: "SweetBites Bakery" });
  await expect(searchTool).toBeEnabled();
  await expect(profileTool).toBeEnabled();
  await expect(page.getByText(/Instructions are reused across runs/i)).toBeVisible();
});
