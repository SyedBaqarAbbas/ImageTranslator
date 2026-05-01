import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function expectCleanEditorBackground(page: Page) {
  const image = page.getByAltText("Selected comic page");
  await expect(image).toBeVisible();
  const src = await image.getAttribute("src");
  expect(src).toBeTruthy();

  const decodedSrc = decodeURIComponent(src ?? "");
  expect(decodedSrc).not.toContain("cleaned-editor-mask");
  expect(decodedSrc).not.toContain("Where did");
  expect(decodedSrc).not.toContain("the signal go?");
  expect(decodedSrc).not.toContain("Keep moving.");
}

test("dashboard shows seeded projects and opens review", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("Cyber Neon Vol. 1")).toBeVisible();

  await page.getByRole("link", { name: "Open" }).first().click();
  await expect(page.getByRole("heading", { name: "Cyber Neon Vol. 1" })).toBeVisible();
  await expect(page.getByText("Quality Review Mode")).toBeVisible();
});

test("upload selection enters project setup", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type='file']", {
    name: "chapter-01.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    ),
  });

  await expect(page.getByRole("heading", { name: "New Project Setup" })).toBeVisible();
  await expect(page.getByText("1 files selected")).toBeVisible();
});

test("editor renders the canvas and translation cards", async ({ page }) => {
  await page.goto("/projects/project-cyber/editor");
  await expect(page.getByRole("heading", { name: "Cyber Neon Vol. 1" })).toBeVisible();
  await expect(page.getByText("2 detected regions")).toBeVisible();
  await expect(page.getByTitle("Region 1")).toBeVisible();
});

test("editor moves and resizes translated overlay without baked duplicate text or static cleanup mask", async ({ page }) => {
  await page.goto("/projects/project-cyber/editor");
  await expectCleanEditorBackground(page);

  const region = page.getByTitle("Region 1");
  await expect(region.getByText("Where did the signal go?")).toHaveCount(1);
  await region.click();

  const beforeDrag = await region.boundingBox();
  expect(beforeDrag).not.toBeNull();
  if (!beforeDrag) throw new Error("Region 1 bounding box was not available before drag.");

  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2 + 48, beforeDrag.y + beforeDrag.height / 2 + 30, {
    steps: 6,
  });
  await page.mouse.up();

  await expect.poll(async () => (await region.boundingBox())?.x ?? 0).toBeGreaterThan(beforeDrag.x + 20);
  await expectCleanEditorBackground(page);
  await expect(region.getByText("Where did the signal go?")).toHaveCount(1);

  const afterDrag = await region.boundingBox();
  expect(afterDrag).not.toBeNull();
  if (!afterDrag) throw new Error("Region 1 bounding box was not available after drag.");

  const southeastHandle = region.locator("span[aria-hidden='true']").nth(4);
  await expect(southeastHandle).toBeVisible();
  const handleBox = await southeastHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (!handleBox) throw new Error("Region 1 resize handle bounding box was not available.");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 36, handleBox.y + handleBox.height / 2 + 28, {
    steps: 6,
  });
  await page.mouse.up();

  await expect.poll(async () => (await region.boundingBox())?.width ?? 0).toBeGreaterThan(afterDrag.width + 15);
  await expectCleanEditorBackground(page);
  await expect(region.getByText("Where did the signal go?")).toHaveCount(1);
});
