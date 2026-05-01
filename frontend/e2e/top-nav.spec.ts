import { expect, test } from "@playwright/test";

test.describe("top navigation popovers", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("dismisses notifications from workspace outside targets and the active trigger", async ({ page }) => {
    await page.goto("/projects");

    const notifications = page.getByRole("button", { name: "Notifications" });
    const notificationPanel = page.getByText("No new workspace notifications.");

    await notifications.click();
    await expect(notifications).toHaveAttribute("aria-expanded", "true");
    await expect(notificationPanel).toBeVisible();

    await page.getByRole("heading", { name: "Projects" }).click();
    await expect(notificationPanel).toBeHidden();
    await expect(notifications).toHaveAttribute("aria-expanded", "false");

    await notifications.click();
    await expect(notificationPanel).toBeVisible();
    await page.locator("aside").click({ position: { x: 36, y: 120 } });
    await expect(notificationPanel).toBeHidden();

    await notifications.click();
    await expect(notificationPanel).toBeVisible();
    await page.getByPlaceholder("Search projects...").first().click();
    await expect(notificationPanel).toBeHidden();

    await notifications.click();
    await expect(notificationPanel).toBeVisible();
    await notifications.click();
    await expect(notificationPanel).toBeHidden();
    await expect(notifications).toHaveAttribute("aria-expanded", "false");
  });

  test("switches sibling menus and closes Help on Escape", async ({ page }) => {
    await page.goto("/projects");

    const notifications = page.getByRole("button", { name: "Notifications" });
    const help = page.getByRole("button", { name: "Help" });
    const notificationPanel = page.getByText("No new workspace notifications.");
    const helpPanelLink = page.getByRole("link", { name: "Workspace settings" });

    await notifications.click();
    await expect(notificationPanel).toBeVisible();

    await help.click();
    await expect(notificationPanel).toBeHidden();
    await expect(notifications).toHaveAttribute("aria-expanded", "false");
    await expect(helpPanelLink).toBeVisible();
    await expect(help).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(helpPanelLink).toBeHidden();
    await expect(help).toHaveAttribute("aria-expanded", "false");
  });

  test("dismisses Share without enabling sharing", async ({ page }) => {
    await page.goto("/projects");

    const share = page.getByRole("button", { name: "Share" });
    const sharePanel = page.getByText("Coming Soon");

    await share.click();
    await expect(sharePanel).toBeVisible();
    await expect(share).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("heading", { name: "Projects" }).click();
    await expect(sharePanel).toBeHidden();
    await expect(share).toHaveAttribute("aria-expanded", "false");
  });

  test("keeps route-change dismissal on workspace and landing routes", async ({ page }) => {
    await page.goto("/projects");

    const notifications = page.getByRole("button", { name: "Notifications" });
    const notificationPanel = page.getByText("No new workspace notifications.");

    await notifications.click();
    await expect(notificationPanel).toBeVisible();
    await page.getByRole("link", { name: "Assets" }).click();
    await expect(page).toHaveURL(/\/assets$/);
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
    await expect(notificationPanel).toBeHidden();

    await notifications.click();
    await expect(notificationPanel).toBeVisible();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(notificationPanel).toBeHidden();

    await notifications.click();
    await expect(notificationPanel).toBeVisible();
    await page.locator("header").getByRole("button", { name: "New project" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Translate and typeset with precision" })).toBeVisible();
    await expect(notificationPanel).toBeHidden();

    await notifications.click();
    await expect(notificationPanel).toBeVisible();
    await page.getByRole("heading", { name: "Translate and typeset with precision" }).click();
    await expect(notificationPanel).toBeHidden();

    await notifications.click();
    await expect(notificationPanel).toBeVisible();
    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(notificationPanel).toBeHidden();
  });
});
