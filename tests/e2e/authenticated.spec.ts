import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test("guest Quick Start stays signed in after returning from chat", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Stateful guest journey runs once.");

  await page.addInitScript(() => {
    window.localStorage.setItem("p2c_device_id", "00000000-0000-4000-8000-000000000817");
  });
  await page.goto("/discover");
  await page.getByRole("button", { name: "Message" }).first().click();
  await page.getByLabel("Nickname").fill("Web Flow Test");
  await page.getByRole("button", { name: "Quick Start" }).click();

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);
  await expect(page.getByPlaceholder("Write a message")).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();

  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);

  await page.getByRole("link", { name: "Chats", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("signed-in wallet and paid bot chat journey", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Stateful journey runs once.");
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated checks.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expect(page.locator(".profile-card")).toHaveCount(6);

  await page.goto("/wallet");
  await page.getByRole("button", { name: "Add coins" }).click();
  await page.locator(".coin-packages button").filter({ hasText: "100" }).first().click();
  await expect(page.getByText("100 coins added.")).toBeVisible();

  await page.goto("/discover");
  const maya = page.locator(".profile-card").filter({ hasText: "Maya" });
  await maya.getByRole("button", { name: "Message" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);

  for (let index = 1; index <= 6; index += 1) {
    await page.getByPlaceholder("Write a message").fill(`E2E message ${index}`);
    await page.getByTitle("Send").click();
    await expect(page.locator(".message-row")).toHaveCount(index * 2);
  }

  await expect(page.locator(".paywall-banner")).toContainText("2 coins");
  await expect(page.locator(".wallet-inline")).toHaveText("98 left");
});
