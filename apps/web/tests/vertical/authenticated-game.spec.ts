import { expect, test, type Page } from "@playwright/test";

const password = "correct-horse-battery-42";

test.describe.configure({ mode: "serial" });

function dynamicBoardRegions(page: Page) {
  return [
    page.locator('[style*="grid-area: left"]'),
    page.locator('[style*="grid-area: right"]'),
    page.locator('img[alt^="Player "]'),
    page.locator('img[alt$=" token"]'),
    page.getByText(/ is playing$/),
  ];
}

async function waitForTransientToasts(page: Page): Promise<void> {
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
}

async function register(page: Page, email: string): Promise<void> {
  await page.goto("/lobby");
  await page.getByRole("button", { name: /^Create( Game)?$/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "New here? Create an account" }).click();
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toBeHidden();
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/lobby");
  await page.getByRole("button", { name: /^Create( Game)?$/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toBeHidden();
}

async function authenticateForProject(page: Page, email: string, projectName: string): Promise<void> {
  if (projectName === "desktop-chromium") {
    await register(page, email);
    return;
  }
  await login(page, email);
}

async function createGame(page: Page, definition = "Classic"): Promise<string> {
  await page.getByRole("button", { name: /^Create( Game)?$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(definition, { exact: true })).toBeVisible();
  const definitionButton = dialog.getByRole("button", { name: new RegExp(`^${definition}`) });
  await definitionButton.click();
  await expect(definitionButton).toHaveClass(/bg-\[#14f195\]/);
  await dialog.getByRole("button", { name: "Create game" }).click();
  await expect(page).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/);
  return page.url().split("/").at(-1)!;
}

test("duplicate start clicks commit once and reload recovers canonical state without past events", async ({ browser }, testInfo) => {
  const projectSuffix = testInfo.project.name.replaceAll(/[^a-z0-9]/gi, "-").toLowerCase();
  const suffix = `${testInfo.repeatEachIndex}`;
  const creatorContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const joiner = await joinerContext.newPage();
  const browserErrors: string[] = [];
  for (const page of [creator, joiner]) {
    page.on("console", (message) => {
      if (message.type() === "error" && /content security policy|refused to connect/i.test(message.text())) {
        browserErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
  }

  try {
    await authenticateForProject(creator, `creator-${suffix}@example.test`, testInfo.project.name);
    const gameId = await createGame(creator);
    await expect(creator.getByRole("button", { name: "Start game" })).toBeVisible({ timeout: 15_000 });
    await expect(creator).toHaveScreenshot(`waiting-${projectSuffix}.png`, {
      mask: dynamicBoardRegions(creator),
    });

    await authenticateForProject(joiner, `joiner-${suffix}@example.test`, testInfo.project.name);
    const gameCard = joiner
      .locator('[data-slot="card"]')
      .filter({ hasText: `Game ID: ${gameId.slice(0, 4)}...${gameId.slice(-4)}` });
    await expect(gameCard.getByText("Players: 1/4")).toBeVisible();
    await gameCard.getByRole("button", { name: "Join" }).click();
    await expect(joiner).toHaveURL(new RegExp(`/game/${gameId}$`));
    await expect(joiner.getByText("Waiting for host to start game")).toBeVisible();
    await expect(creator.getByRole("button", { name: "Start game" })).toBeEnabled();

    await creator.getByRole("button", { name: "Start game" }).dblclick();
    await expect(creator.getByRole("button", { name: "Start game" })).toHaveCount(0);
    await expect(joiner.getByText("Waiting for host to start game")).toHaveCount(0);
    await waitForTransientToasts(creator);
    await expect(creator).toHaveScreenshot(`active-${projectSuffix}.png`, {
      mask: dynamicBoardRegions(creator),
    });

    await joiner.reload();
    await expect(joiner).toHaveURL(new RegExp(`/game/${gameId}$`));
    await expect(joiner.getByText("Waiting for host to start game")).toHaveCount(0);
    await expect(joiner.getByRole("button", { name: "GAME SETTINGS" })).toBeVisible({ timeout: 15_000 });
    expect(browserErrors).toEqual([]);
  } finally {
    await creatorContext.close();
    await joinerContext.close();
  }
});

test("a short authoritative game finishes, settles, and reaches the leaderboard", async ({ browser }, testInfo) => {
  const suffix = `terminal-${testInfo.repeatEachIndex}`;
  const creatorContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const joiner = await joinerContext.newPage();

  try {
    await authenticateForProject(creator, `creator-${suffix}@example.test`, testInfo.project.name);
    const gameId = await createGame(creator, "Short Match");
    await authenticateForProject(joiner, `joiner-${suffix}@example.test`, testInfo.project.name);
    const gameCard = joiner
      .locator('[data-slot="card"]')
      .filter({ hasText: `Game ID: ${gameId.slice(0, 4)}...${gameId.slice(-4)}` });
    await gameCard.getByRole("button", { name: "Join" }).click();
    await expect(joiner).toHaveURL(new RegExp(`/game/${gameId}$`));

    await creator.getByRole("button", { name: "Start game" }).click();
    await expect(creator.getByText(/You won!|Game finished/)).toBeVisible({ timeout: 20_000 });
    await expect(creator.getByText("Account Coin settlement completed.")).toBeVisible({ timeout: 20_000 });

    await creator.goto("/leaderboard");
    await expect(creator.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    const leaderboard = creator.locator('[data-slot="card"]').filter({ hasText: "Top Players" });
    await leaderboard.scrollIntoViewIfNeeded({ timeout: 15_000 });
    await expect(leaderboard).toBeVisible();
    await expect(
      leaderboard.getByRole("button", { name: /[1-9][0-9]* wins · 0 losses/ }),
    ).toBeVisible();
  } finally {
    await creatorContext.close();
    await joinerContext.close();
  }
});

test("join and reconnect outages fail visibly without inventing local room state", async ({ browser }, testInfo) => {
  const suffix = `${testInfo.repeatEachIndex}`;
  const creatorContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const joiner = await joinerContext.newPage();

  try {
    await login(creator, `creator-${suffix}@example.test`);
    const gameId = await createGame(creator);
    await login(joiner, `joiner-${suffix}@example.test`);
    const joinUrl = `**/v1/game-sessions/${gameId}/join-intents`;
    await joiner.route(joinUrl, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "DATABASE_UNAVAILABLE", message: "Database unavailable" },
          requestId: crypto.randomUUID(),
          timestamp: Date.now(),
        }),
      });
    });
    const gameCard = joiner
      .locator('[data-slot="card"]')
      .filter({ hasText: `Game ID: ${gameId.slice(0, 4)}...${gameId.slice(-4)}` });
    await gameCard.getByRole("button", { name: "Join" }).click();
    await expect(joiner.getByText("Unable to join this game. Please try again.")).toBeVisible();
    await expect(joiner).toHaveURL(/\/lobby$/);

    await joiner.unroute(joinUrl);
    await gameCard.getByRole("button", { name: "Join" }).click();
    await expect(joiner).toHaveURL(new RegExp(`/game/${gameId}$`));
    const reconnectUrl = `**/v1/game-sessions/${gameId}/reconnect-ticket`;
    await joiner.route(reconnectUrl, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "DATABASE_UNAVAILABLE", message: "Database unavailable" },
          requestId: crypto.randomUUID(),
          timestamp: Date.now(),
        }),
      });
    });
    await joiner.reload();
    await expect(joiner.getByText("ERROR: Unable to reconnect to this game.")).toBeVisible({ timeout: 15_000 });
    await expect(joiner.getByRole("button", { name: "Try reconnecting" })).toBeVisible();
  } finally {
    await creatorContext.close();
    await joinerContext.close();
  }
});
