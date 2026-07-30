import { expect, type Page } from "@playwright/test";

/**
 * Helpers for driving the dashboard's card selection and bulk toolbar.
 *
 * Why the retries: the dashboard subscribes to the `diagrams-changed` socket
 * event and calls refreshData() on it, and refreshData clears the current
 * selection (see onRefreshSuccess/resetSelection in Dashboard.tsx). The event is
 * broadcast to every connected client, so any other test creating or deleting a
 * diagram in a parallel worker can wipe this page's selection between selecting
 * a card and clicking the bulk action. Without a retry the bulk button is gone
 * or disabled and the click hangs until the test times out.
 */

const ATTEMPTS = 5;
const STEP_TIMEOUT = 5000;
const CARD_TIMEOUT = 30000;

/** Select a single drawing card, waiting for the toggle to report pressed. */
export async function selectCard(page: Page, drawingId: string): Promise<void> {
  const card = page.locator(`#drawing-card-${drawingId}`);
  await expect(card).toBeVisible({ timeout: CARD_TIMEOUT });

  const toggle = card.locator(`[data-testid="select-drawing-${drawingId}"]`);
  if ((await toggle.getAttribute("aria-pressed")) === "true") return;

  await card.hover();
  await toggle.click({ timeout: STEP_TIMEOUT });
  await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: STEP_TIMEOUT });
}

/**
 * Select `drawingId` and click a bulk toolbar button by its title, retrying the
 * pair if a background refresh clears the selection in between.
 */
export async function bulkActionOnCard(
  page: Page,
  drawingId: string,
  buttonTitle: string
): Promise<void> {
  const button = page.getByTitle(buttonTitle);
  let lastError: unknown;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      await selectCard(page, drawingId);
      await expect(button).toBeEnabled({ timeout: STEP_TIMEOUT });
      await button.click({ timeout: STEP_TIMEOUT });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Click "Select All", then a bulk toolbar button, retrying the pair if a
 * background refresh clears the selection.
 *
 * The toolbar button's title flips to "Deselect All" once everything is
 * selected, which makes it a reliable signal: if "Select All" is still showing
 * on a retry, the selection was lost and needs redoing.
 */
export async function selectAllAndRun(page: Page, buttonTitle: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const selectAll = page.getByTitle("Select All");
      if ((await selectAll.count()) > 0) {
        await selectAll.click({ timeout: STEP_TIMEOUT });
      }
      await expect(page.getByTitle("Deselect All")).toBeVisible({ timeout: STEP_TIMEOUT });

      const button = page.getByTitle(buttonTitle);
      await expect(button).toBeEnabled({ timeout: STEP_TIMEOUT });
      await button.click({ timeout: STEP_TIMEOUT });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Select several drawing cards and click a bulk toolbar button, retrying the
 * whole group if the selection is cleared partway through.
 */
export async function bulkActionOnCards(
  page: Page,
  drawingIds: string[],
  buttonTitle: string
): Promise<void> {
  const button = page.getByTitle(buttonTitle);
  let lastError: unknown;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      for (const id of drawingIds) {
        await selectCard(page, id);
      }

      // Confirm nothing was deselected while we worked through the list.
      for (const id of drawingIds) {
        await expect(
          page.locator(`#drawing-card-${id} [data-testid="select-drawing-${id}"]`)
        ).toHaveAttribute("aria-pressed", "true", { timeout: STEP_TIMEOUT });
      }

      await expect(button).toBeEnabled({ timeout: STEP_TIMEOUT });
      await button.click({ timeout: STEP_TIMEOUT });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
