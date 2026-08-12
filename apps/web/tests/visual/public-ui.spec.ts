import { expect, test, type Page } from "@playwright/test";

async function disableMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
}

test("landing page preserves the approved public layout", async ({ page }) => {
  await page.goto("/");
  await disableMotion(page);
  await expect(
    page.getByRole("heading", { name: "MONOPOLY IN REALTIME" })
  ).toBeVisible();
  await expect(page).toHaveScreenshot("landing.png", { fullPage: true });
});

test("email sign-in is the only public authentication entry", async ({
  page,
}) => {
  await page.route("**/v1/auth/refresh", async (route) => {
    await route.fulfill({
      body: "{}",
      contentType: "application/json",
      status: 401,
    });
  });
  await page.goto("/lobby");
  await disableMotion(page);
  await expect(
    page.getByRole("button", { includeHidden: true, name: "Sign in" })
  ).toBeEnabled({ timeout: 20_000 });
  const navigationToggle = page.getByRole("button", {
    name: "Open navigation",
  });
  if (await navigationToggle.isVisible()) {
    await navigationToggle.click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await navigationToggle.click();
  }
  const dialog = page.getByRole("dialog");
  const dialogTitle = dialog.getByRole("heading", {
    name: "Sign in to Pootown",
  });
  await page.getByRole("button", { name: /^Create( Game)?$/ }).click();
  await expect(dialogTitle).toBeVisible();
  await expect(dialog).toHaveScreenshot("email-sign-in.png");
  await expect(page.getByRole("button", { name: /wallet/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /wallet/i })).toHaveCount(0);
});

test("the legacy result demo is no longer a production route", async ({
  page,
}) => {
  const response = await page.goto("/game-result");
  expect(response?.status()).toBe(404);
});
