import { expect, test, type Page } from "@playwright/test";

const password = "correct-horse-battery-42";

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

async function createGame(page: Page): Promise<string> {
  await page.getByRole("button", { name: /^Create( Game)?$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Classic", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Create game" }).click();
  await expect(page).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/);
  return page.url().split("/").at(-1)!;
}

test("two email players create, join, start, and restore the canonical room", async ({ browser }, testInfo) => {
  const projectSuffix = testInfo.project.name.replaceAll(/[^a-z0-9]/gi, "-").toLowerCase();
  const suffix = `${projectSuffix}-${testInfo.repeatEachIndex}`;
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
    await register(creator, `creator-${suffix}@example.test`);
    const gameId = await createGame(creator);
    await expect(creator.getByRole("button", { name: "Start game" })).toBeVisible({ timeout: 15_000 });
    await expect(creator).toHaveScreenshot(`waiting-${projectSuffix}.png`, {
      mask: dynamicBoardRegions(creator),
    });

    await register(joiner, `joiner-${suffix}@example.test`);
    const gameCard = joiner
      .locator('[data-slot="card"]')
      .filter({ hasText: `Game ID: ${gameId.slice(0, 4)}...${gameId.slice(-4)}` });
    await expect(gameCard.getByText("Players: 1/4")).toBeVisible();
    await gameCard.getByRole("button", { name: "Join" }).click();
    await expect(joiner).toHaveURL(new RegExp(`/game/${gameId}$`));
    await expect(joiner.getByText("Waiting for host to start game")).toBeVisible();
    await expect(creator.getByRole("button", { name: "Start game" })).toBeEnabled();

    await creator.getByRole("button", { name: "Start game" }).click();
    await expect(creator.getByRole("button", { name: "Start game" })).toHaveCount(0);
    await expect(joiner.getByText("Waiting for host to start game")).toHaveCount(0);
    await waitForTransientToasts(creator);
    await expect(creator).toHaveScreenshot(`active-${projectSuffix}.png`, {
      mask: dynamicBoardRegions(creator),
    });

    await joiner.reload();
    await expect(joiner).toHaveURL(new RegExp(`/game/${gameId}$`));
    await expect(joiner.getByText("Waiting for host to start game")).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  } finally {
    await creatorContext.close();
    await joinerContext.close();
  }
});
