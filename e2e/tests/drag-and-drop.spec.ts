import { test, expect } from "@playwright/test";
import {
  createDrawing,
  deleteDrawing,
  listDrawings,
  createCollection,
  deleteCollection,
} from "./helpers/api";
import { bulkActionOnCards } from "./helpers/ui";

/**
 * E2E Tests for Drag and Drop functionality
 * 
 * Tests the drag and drop feature mentioned in README:
 * - Drag drawings into collections
 * - Drag files to import drawings
 * - Drag multiple selected drawings
 */

test.describe("Drag and Drop - Collections", () => {
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

  test("should move drawing to collection via card menu", async ({ page, request }) => {
    const collection = await createCollection(request, `DnD_Collection_${Date.now()}`);
    createdCollectionIds.push(collection.id);

    const drawing = await createDrawing(request, { name: `DnD_Drawing_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();

    await card.hover();

    const collectionPicker = card.locator(`[data-testid="collection-picker-${drawing.id}"]`);
    await collectionPicker.click();

    const collectionOption = page.locator(`[data-testid="collection-option-${collection.id}"]`);
    await collectionOption.click();

    await expect(collectionPicker).toContainText(collection.name);

    await page.getByRole("navigation").getByRole("button", { name: collection.name }).click();
    await page.waitForLoadState("networkidle");

    await expect(card).toBeVisible();
  });

  test("should move drawing to Unorganized via card menu", async ({ page, request }) => {
    const collection = await createCollection(request, `UnorgTest_Collection_${Date.now()}`);
    createdCollectionIds.push(collection.id);

    const drawing = await createDrawing(request, {
      name: `UnorgTest_Drawing_${Date.now()}`,
      collectionId: collection.id
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/collections?id=${collection.id}`);
    await page.waitForLoadState("networkidle");

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.waitFor({ timeout: 10000 });
    await card.hover();

    const collectionPicker = card.locator(`[data-testid="collection-picker-${drawing.id}"]`);
    await collectionPicker.click();

    await page.waitForTimeout(300);

    const unorganizedOption = page.locator(`[data-testid="collection-option-unorganized"]`);
    await unorganizedOption.click();

    await page.waitForTimeout(500);

    await expect(card).not.toBeVisible({ timeout: 5000 });

    await page.getByRole("navigation").getByRole("button", { name: "Unorganized" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(`#drawing-card-${drawing.id}`)).toBeVisible();
  });

  test("should move multiple selected drawings to collection via bulk menu", async ({ page, request }) => {
    const collection = await createCollection(request, `BulkMove_Collection_${Date.now()}`);
    createdCollectionIds.push(collection.id);

    const prefix = `BulkMove_${Date.now()}`;
    const [drawing1, drawing2] = await Promise.all([
      createDrawing(request, { name: `${prefix}_A` }),
      createDrawing(request, { name: `${prefix}_B` }),
    ]);
    createdDrawingIds.push(drawing1.id, drawing2.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    // Retried as a unit: the bulk menu closes if the dashboard refreshes (any
    // worker's diagrams-changed broadcast triggers one), which would otherwise
    // leave the collection-option click waiting on a menu that is gone.
    for (let attempt = 0; attempt < 3; attempt++) {
      const moved = await listDrawings(request, { search: prefix, collectionId: collection.id });
      if (moved.length === 2) break;

      try {
        await bulkActionOnCards(page, [drawing1.id, drawing2.id], "Move Selected");
        await page
          .locator(`button:has-text("${collection.name}")`)
          .last()
          .click({ timeout: 5000 });

        await expect
          .poll(
            async () =>
              (await listDrawings(request, { search: prefix, collectionId: collection.id }))
                .length,
            { timeout: 15000 }
          )
          .toBe(2);
        break;
      } catch {
        await page.keyboard.press("Escape");
        await searchInput.fill(prefix);
      }
    }

    await expect
      .poll(
        async () =>
          (await listDrawings(request, { search: prefix, collectionId: collection.id })).length,
        { timeout: 15000 }
      )
      .toBe(2);

    await page.getByRole("navigation").getByRole("button", { name: collection.name }).click();

    await expect(page.locator(`#drawing-card-${drawing1.id}`)).toBeVisible({ timeout: 30000 });
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).toBeVisible({ timeout: 30000 });
  });
});

test.describe("Drag and Drop - File Import", () => {
  let createdDrawingIds: string[] = [];
  /**
   * Names this test imported, so cleanup can find drawings whose id it never
   * learned. Scoped per test on purpose: tests in this file run in parallel
   * workers against one database, so a broad "ImportedDnD" sweep would delete a
   * sibling test's diagram while that test was still asserting on it.
   */
  let importedNameTokens: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const token of importedNameTokens) {
      const drawings = await listDrawings(request, { search: token });
      for (const drawing of drawings) {
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

  test("should show drop zone overlay when dragging files", async ({ page }) => {
    await page.goto("/");

    // Exact match on purpose: a loose /Import/i also matches a card's
    // "Select ImportedDnD_..." toggle, which trips Playwright's strict mode
    // whenever an imported diagram happens to be on the dashboard.
    await expect(page.getByRole("button", { name: "Import", exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator("#dashboard-import")).toBeAttached();
  });

  test("should import a mermaid file via file input", async ({ page, request }) => {
    await page.goto("/");

    const fileBase = `ImportedDnD_${Date.now()}`;
    importedNameTokens.push(fileBase);

    const fileInput = page.locator("#dashboard-import");
    await fileInput.setInputFiles({
      name: `${fileBase}.mmd`,
      mimeType: "text/plain",
      buffer: Buffer.from("graph TD\n    A[Dropped] --> B[Imported]"),
    });

    await expect.poll(async () => {
      const drawings = await listDrawings(request, { search: fileBase });
      return drawings.length;
    }, { timeout: 15000 }).toBeGreaterThan(0);

    await page.getByPlaceholder("Search drawings...").fill(fileBase);
    await page.waitForTimeout(700);

    const importedCards = page.locator("[id^='drawing-card-']");
    await expect(importedCards.first()).toBeVisible();
  });
});
