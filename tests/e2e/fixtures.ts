import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";

type E2EFixtures = {
  testRunPrefix: string;
  testUser: { name: string; email: string; password: string };
};

export const test = base.extend<E2EFixtures>({
  testRunPrefix: async ({}, provide, workerInfo) => {
    await provide(`m14-${workerInfo.workerIndex}-${randomUUID().slice(0, 8)}`);
  },
  testUser: async ({ testRunPrefix }, provide) => {
    await provide({
      name: "Flowyn M14 Browser User",
      email: `${testRunPrefix}@example.test`,
      password: "M14-browser-test-password-123!",
    });
  },
});

export { expect };
