import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const routes = [
  { path: "/", heading: /Translate and typeset with precision/i },
  { path: "/projects", heading: "Projects" },
  { path: "/projects/new", heading: "New Project Setup" },
  { path: "/assets", heading: "Assets" },
  { path: "/team", heading: "Projects", expectedPath: "/projects" },
  { path: "/settings", heading: "Settings" },
  { path: "/batch-ocr", heading: "Batch OCR" },
  { path: "/typefaces", heading: "Typefaces" },
  { path: "/archive", heading: "Archive" },
  { path: "/account", heading: "Account" },
  { path: "/support", heading: "Support" },
  { path: "/projects/project-cyber/processing", heading: "Cyber Neon Vol. 1" },
  { path: "/projects/project-cyber/review", heading: "Cyber Neon Vol. 1" },
  { path: "/projects/project-cyber/editor", heading: "Cyber Neon Vol. 1" },
  { path: "/projects/project-samurai/export", heading: "Export Project" },
  { path: "/unknown-route", heading: "Projects", expectedPath: "/projects" },
];

async function installFailureCollectors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("/favicon")) {
      failedRequests.push(`${url}: ${request.failure()?.errorText ?? "unknown"}`);
    }
  });

  return { consoleErrors, pageErrors, failedRequests };
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(`route coverage ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of routes) {
      test(`${route.path} renders expected route`, async ({ page }) => {
        const failures = await installFailureCollectors(page);
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => undefined);

        if (route.expectedPath) {
          await expect(page).toHaveURL(new RegExp(`${route.expectedPath}$`));
        }
        await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
        expect(failures.consoleErrors).toEqual([]);
        expect(failures.pageErrors).toEqual([]);
        expect(failures.failedRequests).toEqual([]);
      });
    }
  });
}
