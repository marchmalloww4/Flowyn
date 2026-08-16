import { expect, test } from "./fixtures";
import { signUp } from "./auth-helpers";

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

test("browser Agent runs follow the persisted run-ID contract", async ({ page, testRunPrefix, testUser }) => {
  test.setTimeout(180_000);
  await signUp(page, testUser);
  await page.goto("/dashboard/brands");
  await page.getByLabel("Workspace name").fill(`${testRunPrefix} SweetBites Bakery`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByLabel("Brand name").fill("SweetBites Bakery");
  await page.getByLabel("Short description").fill("Fresh brownies for local customers.");
  await page.getByRole("button", { name: "Add brand" }).click();

  const workspaceId = await page.getByLabel("Select workspace").inputValue();
  expect(workspaceId).toMatch(uuidPattern);

  const brandResponse = await page.request.get(`/api/brands?workspaceId=${encodeURIComponent(workspaceId)}`);
  expect(brandResponse.ok()).toBe(true);
  const brandBody = await brandResponse.json() as { brands: Array<{ id: string; name: string }> };
  const brand = brandBody.brands.find((candidate) => candidate.name === "SweetBites Bakery");
  expect(brand).toBeDefined();

  const knowledgeResponse = await page.request.post("/api/knowledge", {
    data: {
      workspaceId,
      brandId: brand!.id,
      title: "Confirmed SweetBites facts",
      sourceType: "manual",
      sourceName: "Browser qualification",
      content: "Classic Chocolate Brownies cost RM25 per box of 6 brownies. Customers order through WhatsApp. Orders should be placed at least 2 days in advance. There is no active discount or promotion.",
      metadata: {},
    },
  });
  expect(knowledgeResponse.status()).toBe(201);

  const agentResponse = await page.request.post("/api/agents", {
    data: {
      workspaceId,
      brandId: brand!.id,
      name: "SweetBites Marketing Assistant",
      description: "Browser run-ID qualification agent",
      systemInstructions: "Use saved brand information only. Do not invent business claims.",
      allowedTools: ["search_brand_knowledge", "get_brand_profile"],
      enabled: true,
      maxSteps: 5,
    },
  });
  expect(agentResponse.status()).toBe(201);

  const runPosts: string[] = [];
  const historyGets: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/agents\/[^/]+\/runs$/.test(new URL(request.url()).pathname)) runPosts.push(request.url());
    if (request.method() === "GET" && /\/api\/agent-runs\/[^/]+$/.test(new URL(request.url()).pathname)) historyGets.push(request.url());
  });

  await page.goto("/dashboard/agents");
  const agentCard = page.getByRole("article").filter({ hasText: "SweetBites Marketing Assistant" });
  await expect(agentCard).toBeVisible();
  await page.getByLabel("Brand context").selectOption({ label: "SweetBites Bakery" });
  await page.getByLabel("Run goal").fill("What is the confirmed price of our Classic Chocolate Brownies, how many brownies are in one box, how should customers order, and how far in advance should they order? Use saved brand information only.");
  await page.getByRole("button", { name: "Run agent", exact: true }).click();

  await expect(agentCard).toContainText("Status: Completed", { timeout: 120_000 });
  await expect(agentCard).toContainText(/Run ID [0-9a-f-]{36}/i);
  await expect(agentCard).toContainText("RM25");
  await expect(agentCard).toContainText("6 brownies");
  await expect(agentCard).toContainText("WhatsApp");
  await expect(agentCard).toContainText(/2 days?/i);
  await expect(agentCard).not.toContainText("<p>");
  expect(runPosts).toHaveLength(1);
  expect(historyGets).toHaveLength(1);
  expect(historyGets[0]).toMatch(uuidPattern);
  expect(historyGets[0]).not.toContain("undefined");

  await page.getByLabel("Run goal").fill("Create a seven-day marketing plan using saved brand information only. If a business fact is missing, suggest owner confirmation instead of inventing it.");
  const runAgain = agentCard.getByRole("button", { name: "Run again" });
  await expect(runAgain).toBeEnabled();
  const secondRunPost = page.waitForRequest((request) => request.method() === "POST" && /\/api\/agents\/[^/]+\/runs$/.test(new URL(request.url()).pathname));
  await Promise.all([secondRunPost, runAgain.click()]);
  await expect.poll(() => historyGets.length, { timeout: 120_000 }).toBe(2);
  await expect(agentCard).toContainText("Status: Completed", { timeout: 120_000 });
  await expect(agentCard).toContainText(/Run ID [0-9a-f-]{36}/i);
  expect(runPosts).toHaveLength(2);
  expect(historyGets).toHaveLength(2);
  expect(historyGets.every((url) => uuidPattern.test(url) && !url.includes("undefined"))).toBe(true);
  await expect(agentCard).not.toContainText(/50%\s+off|free\s+delivery|customer\s+testimonial|halal|belgian\s+chocolate/i);
  await expect(agentCard).not.toContainText("<p>");
});
