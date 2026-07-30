import { test, expect, type Page } from "@playwright/test";
import { createDrawing, deleteDrawing, getDrawing } from "./helpers/api";

/**
 * E2E Tests for Real-time Collaboration
 *
 * Tests the real-time collaboration feature mentioned in README:
 * - Presence is shared between users viewing the same diagram
 * - Mermaid source edits sync between users over the content-update socket event
 * - Edits survive a page reload
 */

const EDITOR_READY_TIMEOUT = 45000;

/**
 * Wait for the mermaid editor to be interactive.
 *
 * These tests drive two browser contexts at once and run alongside the rest of
 * the suite, so they get a longer budget than a single-page test would need.
 */
const waitForEditor = async (page: Page) => {
  await page.waitForSelector("[data-mermaid-canvas]", { timeout: EDITOR_READY_TIMEOUT });
  await page
    .locator(".monaco-editor")
    .first()
    .waitFor({ state: "visible", timeout: EDITOR_READY_TIMEOUT });
};

/** Append text to the mermaid source in the editor's Monaco code panel. */
const typeIntoMermaidSource = async (page: Page, text: string) => {
  const monaco = page.locator(".monaco-editor").first();
  await monaco.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text, { delay: 20 });
};

test.describe("Real-time Collaboration", () => {
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

  test("should show presence when multiple users view same drawing", async ({
    browser,
    request,
  }) => {
    const drawing = await createDrawing(request, { name: `Collab_Presence_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      await page1.goto(`/editor/${drawing.id}`);
      await waitForEditor(page1);

      // Only one client so far, so nobody else should be listed.
      await expect(page1.locator("[data-testid='collaborator-avatar']")).toHaveCount(0);

      await page2.goto(`/editor/${drawing.id}`);
      await waitForEditor(page2);

      // The server broadcasts presence-update to the room, so each client should
      // now see exactly one peer.
      await expect(page1.locator("[data-testid='collaborator-avatar']")).toHaveCount(1, {
        timeout: EDITOR_READY_TIMEOUT,
      });
      await expect(page2.locator("[data-testid='collaborator-avatar']")).toHaveCount(1, {
        timeout: EDITOR_READY_TIMEOUT,
      });
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test("should sync drawing changes between two users", async ({ browser, request }) => {
    const drawing = await createDrawing(request, {
      name: `Collab_Sync_${Date.now()}`,
      content: "graph TD\n    A[Start] --> B[End]",
    });
    createdDrawingIds.push(drawing.id);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      await page1.goto(`/editor/${drawing.id}`);
      await page2.goto(`/editor/${drawing.id}`);
      await waitForEditor(page1);
      await waitForEditor(page2);

      // Wait until both clients have joined the room, otherwise the edit below
      // can be emitted before page2 is listening.
      await expect(page1.locator("[data-testid='collaborator-avatar']")).toHaveCount(1, {
        timeout: EDITOR_READY_TIMEOUT,
      });

      await typeIntoMermaidSource(page1, "\n    B --> C[Synced]");

      // page2 receives content-update and re-renders the shared source.
      await expect(page2.locator(".monaco-editor").first()).toContainText("C[Synced]", {
        timeout: EDITOR_READY_TIMEOUT,
      });
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test("should persist drawing changes across page reload", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Collab_Persist_${Date.now()}`,
      content: "graph TD\n    A[Start] --> B[End]",
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await waitForEditor(page);

    await typeIntoMermaidSource(page, "\n    B --> C[Persisted]");

    // The editor debounces its save, so poll until the server has the edit.
    await expect
      .poll(async () => (await getDrawing(request, drawing.id)).content ?? "", {
        timeout: EDITOR_READY_TIMEOUT,
      })
      .toContain("C[Persisted]");

    await page.reload();
    await waitForEditor(page);

    await expect(page.locator(".monaco-editor").first()).toContainText("C[Persisted]", {
      timeout: EDITOR_READY_TIMEOUT,
    });
  });

  // Note: the server supports a cursor-move event, but no client emits or
  // listens for it, so there is no collaborator-cursor behaviour to test yet.
});
