import { expect, test } from "@playwright/test";

test("signed-out visitors see the real authentication screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("protected routes return to sign in", async ({ page }) => {
  await page.goto("/wallet");
  await expect(page).toHaveURL(/\/login\?next=%2Fwallet$/);
});

test("public profiles render data and real media", async ({ page }) => {
  await page.goto("/u/maya");
  await expect(page.getByRole("heading", { name: /Maya, 27/ })).toBeVisible();
  await expect(page.getByText("10 free")).toBeVisible();
  const hero = page.locator(".public-profile-hero > img");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test("key public screens do not overflow the viewport", async ({ page }) => {
  for (const path of ["/login", "/u/maya"]) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});
