import type { Page } from "@playwright/test";

export async function signUp(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").pressSequentially(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard(?:$|\/)/);
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();
}
