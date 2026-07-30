import { test, expect } from "@playwright/test";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
} from "./helpers/api";
import { bulkActionOnCard } from "./helpers/ui";

/**
 * E2E Tests for Drawing Creation and Editing
 * 
 * Tests the persistent storage feature mentioned in README:
 * - Create new drawings
 * - Edit drawing names
 * - Delete drawings
 * - Drawing canvas interactions
 * - Auto-save functionality
 */

const revealEditorHeader = async (page: import("@playwright/test").Page) => {
  await page.mouse.move(24, 2);
  await page.waitForTimeout(150);
};

/**
 * Append text to the mermaid source in the editor's Monaco code panel.
 *
 * Monaco keeps a hidden textarea for input, so we click into the editor to
 * focus it, jump to the end of the document, then type.
 */
const typeIntoMermaidSource = async (
  page: import("@playwright/test").Page,
  text: string
) => {
  const monaco = page.locator(".monaco-editor").first();
  // Generous: @monaco-editor/react is not configured with a local loader, so the
  // Monaco runtime is fetched from the jsdelivr CDN on first editor mount.
  await monaco.waitFor({ state: "visible", timeout: 45000 });
  await monaco.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text, { delay: 20 });
};

test.describe("Drawing Creation", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];
  });

  test("should create a new drawing via UI", async ({ page, request }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const newDrawingButton = page.getByRole("button", { name: /New Drawing/i });
    await newDrawingButton.click();

    await page.waitForURL(/\/editor\//);

    const url = page.url();
    const match = url.match(/\/editor\/([^/]+)/);
    expect(match).toBeTruthy();
    const drawingId = match![1];
    createdDrawingIds.push(drawingId);

    await page.waitForSelector("[data-mermaid-canvas]", { timeout: 15000 });

    const drawing = await getDrawing(request, drawingId);
    expect(drawing).toBeDefined();
    expect(drawing.name).toBe("Untitled Drawing");
  });

  test("should open existing drawing in editor", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `Open_Test_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Search drawings...").fill(drawing.name);
    await page.waitForTimeout(500);

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.click();

    await page.waitForURL(`/editor/${drawing.id}`);

    await page.waitForSelector("[data-mermaid-canvas]", { timeout: 15000 });
  });

  test("should display drawing name in editor header", async ({ page, request }) => {
    const drawingName = `Header_Test_${Date.now()}`;
    const drawing = await createDrawing(request, { name: drawingName });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[data-mermaid-canvas]", { timeout: 15000 });

    await expect(page.getByText(drawingName)).toBeVisible();
  });

  test("should rename drawing via editor header", async ({ page, request }) => {
    const originalName = `Rename_Original_${Date.now()}`;
    const newName = `Rename_Updated_${Date.now()}`;

    const drawing = await createDrawing(request, { name: originalName });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[data-mermaid-canvas]", { timeout: 15000 });

    await revealEditorHeader(page);

    const nameElement = page.getByText(originalName);
    await expect(nameElement).toBeInViewport();
    await nameElement.dblclick();

    await page.waitForTimeout(300);

    const nameInput = page.locator("input").filter({ hasText: "" }).first();
    await nameInput.clear();
    await nameInput.fill(newName);
    await nameInput.press("Enter");

    await page.waitForTimeout(1000);

    const updatedDrawing = await getDrawing(request, drawing.id);
    expect(updatedDrawing.name).toBe(newName);
  });

  test("should navigate back to dashboard from editor", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `BackNav_Test_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[data-mermaid-canvas]", { timeout: 15000 });

    await revealEditorHeader(page);

    const backButton = page.locator("header button").first();
    await expect(backButton).toBeInViewport();
    await backButton.click();

    await page.waitForURL("/");
    await expect(page.getByPlaceholder("Search drawings...")).toBeVisible();
  });
});

test.describe("Drawing Editing", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];
  });

  test("should edit mermaid source and persist it", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Edit_Source_${Date.now()}`,
      content: "graph TD\n    A[Start] --> B[End]",
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[data-mermaid-canvas]", { timeout: 15000 });

    await typeIntoMermaidSource(page, "\n    B --> C[Extra]");

    // The editor debounces its save, so poll the API until it lands.
    await expect
      .poll(async () => (await getDrawing(request, drawing.id)).content ?? "", {
        timeout: 15000,
      })
      .toContain("C[Extra]");
  });

  test("should use undo/redo functionality", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Undo_Redo_${Date.now()}`,
      content: "graph TD\n    A[Start] --> B[End]",
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[data-mermaid-canvas]", { timeout: 15000 });

    const undoButton = page.locator('button[title="Undo"]');
    const redoButton = page.locator('button[title="Redo"]');

    // Nothing has been edited yet, so there is no history to step back through.
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await typeIntoMermaidSource(page, "\n    B --> C[Undo me]");
    await expect(undoButton).toBeEnabled({ timeout: 15000 });

    await undoButton.click();
    await expect(redoButton).toBeEnabled();
  });
});

test.describe("Drawing Deletion", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];
  });

  test("should delete drawing via card menu", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `Delete_Card_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Search drawings...").fill(drawing.name);
    await page.waitForTimeout(500);

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await bulkActionOnCard(page, drawing.id, "Move to Trash");

    await expect(card).not.toBeVisible();

    await page.getByRole("button", { name: /^Trash$/ }).click();

    await expect(page.locator(`#drawing-card-${drawing.id}`)).toBeVisible();
  });

  test("should permanently delete drawing from trash", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Perm_Delete_${Date.now()}`,
      collectionId: "trash"
    });
    createdDrawingIds.push(drawing.id);

    await page.goto("/?view=trash");
    await page.getByRole("button", { name: /^Trash$/ }).click();

    // Waiting for the card itself, rather than networkidle: the dashboard keeps
    // background requests in flight (socket plus thumbnail backfill), so a
    // network-quiet window is not guaranteed to arrive.
    const card = page.locator(`#drawing-card-${drawing.id}`);
    await expect(card).toBeVisible({ timeout: 30000 });

    await bulkActionOnCard(page, drawing.id, "Delete Permanently");

    await page.getByRole("button", { name: /Delete \d+ Drawings?/i }).click();

    await expect(card).not.toBeVisible();

    const response = await request.get(`${API_URL}/drawings/${drawing.id}`);
    expect(response.status()).toBe(404);

    createdDrawingIds = createdDrawingIds.filter(id => id !== drawing.id);
  });

  test("should duplicate drawing", async ({ page, request }) => {
    const baseName = `Duplicate_Test_${Date.now()}`;
    const drawing = await createDrawing(request, { name: baseName });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Search drawings...").fill(baseName);
    await page.waitForTimeout(500);

    await bulkActionOnCard(page, drawing.id, "Duplicate Selected");

    await expect.poll(async () => {
      const allDrawings = await listDrawings(request, { search: baseName });
      return allDrawings.length;
    }, { timeout: 10000 }).toBe(2);

    await page.getByPlaceholder("Search drawings...").fill(baseName);
    await page.waitForTimeout(700);
    await expect(page.locator("[id^='drawing-card-']")).toHaveCount(2);

    const allDrawings = await listDrawings(request, { search: baseName });
    for (const d of allDrawings) {
      if (!createdDrawingIds.includes(d.id)) {
        createdDrawingIds.push(d.id);
      }
    }
  });
});
