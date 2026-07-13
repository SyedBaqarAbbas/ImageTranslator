import { expect, test } from "@playwright/test";

test("loads the local ImageTranslator brand and Inter foundation", async ({ page }) => {
  const remoteFontRequests: string[] = [];

  page.on("request", (request) => {
    if (/fonts\.(?:googleapis|gstatic)\.com/i.test(request.url())) {
      remoteFontRequests.push(request.url());
    }
  });

  await page.goto("/projects");
  await expect(page).toHaveTitle("ImageTranslator");
  await expect(page.getByRole("link", { name: "ImageTranslator" })).toBeVisible();

  const fontState = await page.evaluate(async () => {
    await document.fonts.ready;
    const loadedFamilies: string[] = [];
    document.fonts.forEach((font) => {
      if (font.status === "loaded") {
        loadedFamilies.push(font.family);
      }
    });

    return {
      bodyFamily: getComputedStyle(document.body).fontFamily,
      loadedFamilies,
    };
  });

  expect(fontState.bodyFamily).toContain("Inter Variable");
  expect(fontState.loadedFamilies).toContain("Inter Variable");
  expect(remoteFontRequests).toEqual([]);
});
