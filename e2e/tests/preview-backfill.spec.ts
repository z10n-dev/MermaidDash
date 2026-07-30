import { expect, test } from "@playwright/test";
import { createDrawing, deleteDrawing, getDrawing } from "./helpers/api";

/**
 * Regression guard: diagrams created outside the editor (MCP server, import,
 * public API) arrive with no `preview`, because only the editor produced one.
 * The dashboard must generate and persist the thumbnail on its own.
 */
test.describe("Dashboard preview backfill", () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdIds.length = 0;
  });

  test("an API-created drawing gets a thumbnail from a dashboard visit alone", async ({
    page,
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: `Backfill ${Date.now()}`,
      content: "graph TD\n    A[Start] --> B[End]",
      preview: null,
    });
    createdIds.push(drawing.id);

    // Created outside the editor, so it starts with no preview — this is the bug.
    expect(drawing.preview ?? null).toBeNull();

    await page.goto("/");

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await expect(card).toBeVisible();

    // The thumbnail should appear without the editor ever being opened.
    await expect(card.locator("img")).toBeVisible({ timeout: 20_000 });

    // ...and it should be persisted, so a reload needs no regeneration.
    await expect
      .poll(async () => (await getDrawing(request, drawing.id)).preview, { timeout: 20_000 })
      .toMatch(/^data:image\/png;base64,/);
  });
});
