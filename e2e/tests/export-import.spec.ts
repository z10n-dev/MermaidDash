import { test, expect } from "@playwright/test";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getCsrfHeaders,
  listDrawings,
  deleteCollection,
} from "./helpers/api";

/**
 * E2E Tests for Export/Import functionality
 * 
 * Tests the export/import feature:
 * - Backup export controls and the zip the API returns
 *   (the `.mermaiddash` extension is applied client-side by Settings.tsx when
 *   it names the download; the API always sends a .zip)
 * - Importing `.mmd` and `.mermaid.json` files from the Dashboard
 */

test.describe("Export Functionality", () => {
  let createdDrawingIds: string[] = [];
  let createdCollectionIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];

    for (const id of createdCollectionIds) {
      try {
        await deleteCollection(request, id);
      } catch {
      }
    }
    createdCollectionIds = [];
  });

  test("should show backup export controls on Settings page", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `Export_Backup_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Export Backup" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Export$/ })).toBeVisible();
    const downloadNameSelect = page.getByRole("combobox", { name: "Download name" });
    await expect(downloadNameSelect).toBeVisible();
    await expect(downloadNameSelect.locator('option[value="mermaiddash"]')).toHaveText(".mermaiddash");
    await expect(downloadNameSelect.locator('option[value="mermaiddash.zip"]')).toHaveText(".mermaiddash.zip");
  });

  test("should export a dated backup zip via API", async ({ request }) => {
    const drawing = await createDrawing(request, { name: `Export_API_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    const response = await request.get(`${API_URL}/export/mermaid`);
    expect(response.ok()).toBe(true);

    const contentType = response.headers()["content-type"];
    expect(contentType).toMatch(/application\/zip/);

    const contentDisposition = response.headers()["content-disposition"];
    expect(contentDisposition).toContain("attachment");
    expect(contentDisposition).toMatch(/mermaiddash-backup-\d{4}-\d{2}-\d{2}\.zip/);
  });

  test("should return a real zip archive body", async ({ request }) => {
    const drawing = await createDrawing(request, { name: `Export_Zip_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    const response = await request.get(`${API_URL}/export/mermaid`);
    expect(response.ok()).toBe(true);

    // "PK" is the ZIP local-file-header magic; a truncated or JSON error body
    // would not start with it.
    const body = await response.body();
    expect(body.length).toBeGreaterThan(0);
    expect(body.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

test.describe.serial("Import Functionality", () => {
  let createdDrawingIds: string[] = [];
  /**
   * Name prefixes this file's tests imported, so cleanup can find drawings it
   * never learned the id of.
   *
   * Each token carries a timestamp on purpose. A broad token like "Import_"
   * would be unsafe: Prisma's `contains` compiles to SQL LIKE, where `_` is a
   * single-character wildcard, so "Import_" also matches "ImportedDnD_..." from
   * drag-and-drop.spec.ts — which runs in a parallel worker against the same
   * database.
   */
  let importedNameTokens: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const token of importedNameTokens) {
      const testDrawings = await listDrawings(request, { search: token });
      for (const drawing of testDrawings) {
        try {
          await deleteDrawing(request, drawing.id);
        } catch {
        }
      }
    }
    importedNameTokens = [];

    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];
  });

  test("should show Import Backup button on Settings page", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const advancedDetails = page.locator("details", { hasText: "Advanced / Legacy" });
    await expect(advancedDetails).toHaveCount(1);
    const isOpen = await advancedDetails.evaluate((el) => el.hasAttribute("open"));
    if (!isOpen) {
      await advancedDetails.locator("summary").click();
    }

    await expect(page.getByRole("heading", { name: "Import Backup" })).toBeVisible();
    await expect(page.locator("#settings-import-backup")).toBeAttached();
  });

  test("should import a .mmd file from Dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const testName = `Import_Mmd_${Date.now()}`;
    importedNameTokens.push(testName);

    const fileInput = page.locator("#dashboard-import");
    await fileInput.setInputFiles({
      name: `${testName}.mmd`,
      mimeType: "text/plain",
      buffer: Buffer.from("graph TD\n    A[Imported] --> B[Diagram]"),
    });

    await expect(page.getByText("Uploads (Done)")).toBeVisible({ timeout: 15000 });

    await page.reload({ waitUntil: "networkidle" });

    await page.getByPlaceholder("Search drawings...").fill(testName);
    await page.waitForTimeout(1000);

    const importedCards = page.locator("[id^='drawing-card-']");
    await expect(importedCards.first()).toBeVisible({ timeout: 15000 });
  });

  test("should import a .mermaid.json file from Dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const testName = `Import_JSONTest_${Date.now()}`;
    importedNameTokens.push(testName);

    // The frontend export format — see ExportData in frontend/src/utils/exportUtils.ts
    const jsonContent = JSON.stringify({
      type: "mermaid",
      version: 1,
      source: "e2e-test",
      content: "graph TD\n    A[From JSON] --> B[End]",
    });

    const fileInput = page.locator("#dashboard-import");
    await fileInput.setInputFiles({
      name: `${testName}.mermaid.json`,
      mimeType: "application/json",
      buffer: Buffer.from(jsonContent),
    });

    await expect(page.getByText("Uploads (Done)")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Failed")).toHaveCount(0);

    await page.reload({ waitUntil: "networkidle" });

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.clear();
    await searchInput.fill(testName);
    await page.waitForTimeout(1500);

    const importedCards = page.locator("[id^='drawing-card-']");
    await expect(importedCards.first()).toBeVisible({ timeout: 15000 });
  });

  test("should show error for invalid import file", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const fileInput = page.locator("#dashboard-import");
    await fileInput.setInputFiles({
      name: `Import_Invalid_${Date.now()}.mermaid.json`,
      mimeType: "application/json",
      buffer: Buffer.from("this is not a valid .mermaid.json payload {}{}"),
    });

    await expect(page.getByText("Uploads (Done)")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Failed")).toBeVisible();
  });

  test("should import multiple drawings at once", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchPrefix = `Import_Multi_${Date.now()}`;
    importedNameTokens.push(searchPrefix);
    const files = [
      {
        name: `${searchPrefix}_A.mmd`,
        mimeType: "text/plain",
        buffer: Buffer.from("graph TD\n    A1[One] --> B1[Two]"),
      },
      {
        name: `${searchPrefix}_B.mmd`,
        mimeType: "text/plain",
        buffer: Buffer.from("graph LR\n    A2[Three] --> B2[Four]"),
      },
    ];

    const fileInput = page.locator("#dashboard-import");
    await fileInput.setInputFiles(files);

    await expect(page.getByText("Uploads (Done)")).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("Search drawings...").fill(searchPrefix);
    await page.waitForTimeout(1000);

    const importedCards = page.locator("[id^='drawing-card-']");
    await expect(importedCards).toHaveCount(2);
  });
});

// Note: the legacy SQLite import endpoint (/import/sqlite/legacy/verify) no
// longer exists — /import/mermaid is the only import route — so there is
// nothing left to verify here.
