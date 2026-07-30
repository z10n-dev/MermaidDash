import type { DrawingSummary } from "../types";

/** Minimal shape the backfill needs from a dashboard card. */
export type PreviewCandidate = Pick<DrawingSummary, "id" | "preview" | "accessLevel">;

/**
 * Everything the backfill touches from the outside world. Injected so the queue
 * can be tested under jsdom, where mermaid layout and canvas rasterization are
 * both unavailable.
 */
export type PreviewBackfillDeps = {
  /** Fetch the mermaid source for a drawing. */
  fetchContent: (id: string) => Promise<string>;
  /** Render mermaid source to a self-contained SVG string. */
  renderSvg: (content: string) => Promise<string | null>;
  /** Rasterize an SVG string to a PNG data URL. */
  toPng: (svg: string) => Promise<string | null>;
  /**
   * Persist the thumbnail. MUST send a preview-only payload: the backend treats
   * any request carrying `content` as a scene update, which bumps `version` and
   * can 409 against an open editor.
   */
  savePreview: (id: string, preview: string) => Promise<void>;
  onSaved: (id: string, preview: string) => void;
  onFailed: (id: string, reason: unknown) => void;
  /** Checked before each item so an unmounted dashboard stops writing. */
  isCancelled: () => boolean;
};

const DEFAULT_CONCURRENCY = 2;

/** `PUT /drawings/:id` is gated by canEditDrawing, so read-only rows would 404. */
const isWritable = (accessLevel: DrawingSummary["accessLevel"]): boolean =>
  accessLevel === undefined || accessLevel === "edit" || accessLevel === "owner";

/**
 * Pick the drawings whose thumbnail should be generated now.
 *
 * Order is preserved from the input so the cards nearest the top of the
 * dashboard are filled first.
 */
export const selectPreviewCandidates = (
  drawings: PreviewCandidate[],
  options: { attempted: ReadonlySet<string>; skipAll?: boolean; limit?: number }
): string[] => {
  if (options.skipAll) return [];

  const ids = drawings
    .filter((d) => !d.preview && !options.attempted.has(d.id) && isWritable(d.accessLevel))
    .map((d) => d.id);

  return options.limit === undefined ? ids : ids.slice(0, options.limit);
};

const backfillOne = async (id: string, deps: PreviewBackfillDeps): Promise<void> => {
  try {
    const content = await deps.fetchContent(id);
    const svg = await deps.renderSvg(content);
    if (!svg) throw new Error("mermaid render produced no SVG");

    const png = await deps.toPng(svg);
    if (!png) throw new Error("SVG rasterization produced no PNG");

    if (deps.isCancelled()) return;

    await deps.savePreview(id, png);
    deps.onSaved(id, png);
  } catch (reason) {
    deps.onFailed(id, reason);
  }
};

/**
 * Generate and persist previews for `ids`, at most `concurrency` at a time.
 *
 * Always resolves — per-item failures are reported through `onFailed` so one
 * broken diagram cannot stall the rest.
 */
export const runPreviewBackfill = async (
  ids: string[],
  deps: PreviewBackfillDeps,
  options: { concurrency?: number } = {}
): Promise<void> => {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < ids.length) {
      if (deps.isCancelled()) return;
      const id = ids[cursor++];
      await backfillOne(id, deps);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, () => worker())
  );
};
