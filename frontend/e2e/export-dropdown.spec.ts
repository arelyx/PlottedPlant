import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost";

test.use({ viewport: { width: 1280, height: 720 } });

async function loginAndNavigateToDoc(page: any, docId = 71) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill("playwright@test.com");
  await page.locator('input[type="password"]').fill("Test1234#");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
  await page.waitForTimeout(1000);

  // SPA navigation (page.goto loses in-memory auth state)
  await page.evaluate((url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.click();
  }, `/documents/${docId}`);

  await page.waitForTimeout(3000);
  await page.locator('[data-slot="dropdown-menu-trigger"]').waitFor({ state: "visible", timeout: 10000 });
}

test.describe("Export Dropdown", () => {
  test("should open dropdown with 3 options when clicking Export", async ({
    page,
  }) => {
    await loginAndNavigateToDoc(page);

    const exportButton = page.locator('[data-slot="dropdown-menu-trigger"]');
    await expect(exportButton).toBeVisible({ timeout: 5000 });

    await exportButton.click();
    await page.waitForTimeout(500);

    // Check menu items
    const menuItems = page.locator('[role="menuitem"]');
    const menuCount = await menuItems.count();
    expect(menuCount).toBe(3);

    await expect(page.getByRole("menuitem", { name: "Download SVG" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Download PNG" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Download Source (.puml)" })).toBeVisible();
  });

  test("Download SVG should trigger a download", async ({ page }) => {
    await loginAndNavigateToDoc(page);

    const exportButton = page.locator('[data-slot="dropdown-menu-trigger"]');
    await exportButton.click();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.getByRole("menuitem", { name: "Download SVG" }).click();

    const download = await downloadPromise;
    console.log("SVG download filename:", download.suggestedFilename());
    expect(download.suggestedFilename()).toContain(".svg");
  });

  test("Download PNG should trigger a download", async ({ page }) => {
    await loginAndNavigateToDoc(page);

    const exportButton = page.locator('[data-slot="dropdown-menu-trigger"]');
    await exportButton.click();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
    await page.getByRole("menuitem", { name: "Download PNG" }).click();

    const download = await downloadPromise;
    console.log("PNG download filename:", download.suggestedFilename());
    expect(download.suggestedFilename()).toContain(".png");
  });

  test("Download Source should trigger a download", async ({ page }) => {
    await loginAndNavigateToDoc(page);

    const exportButton = page.locator('[data-slot="dropdown-menu-trigger"]');
    await exportButton.click();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.getByRole("menuitem", { name: "Download Source (.puml)" }).click();

    const download = await downloadPromise;
    console.log("Source download filename:", download.suggestedFilename());
    expect(download.suggestedFilename()).toContain(".puml");
  });
});
