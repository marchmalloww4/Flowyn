import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

const surfaces = [
  ["/dashboard", "Build your first AI workforce"],
  ["/dashboard/brands", "Make your context useful"],
  ["/dashboard/knowledge", "Make retrieval trustworthy"],
  ["/dashboard/ai", "Generate with guardrails"],
  ["/dashboard/agents", "Keep agents controlled"],
  ["/dashboard/workflows", "Compose durable work"],
  ["/dashboard/schedules", "Put durable work on a clock"],
  ["/dashboard/webhooks", "Receive signed workflow triggers"],
  ["/dashboard/approvals", "Review human gates"],
  ["/dashboard/integrations", "Connect Slack safely"],
  ["/dashboard/operations", "See how the workspace is running"],
  ["/dashboard/settings", "Keep the boundary clear"],
] as const;

test("the authenticated shell reaches every M14 product surface", async ({ page, testUser }) => {
  await signUp(page, testUser);
  for (const [route, heading] of surfaces) {
    await page.goto(route);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: new RegExp(heading, "i") })).toBeVisible();
    await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
  }
});
