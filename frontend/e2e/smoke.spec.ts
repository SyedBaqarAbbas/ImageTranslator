import { expect, test } from "@playwright/test";

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
