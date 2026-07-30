# Dashboard Preview Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard cards that have no stored thumbnail render their mermaid source in the browser, persist the result as `drawing.preview`, and show the image without the user having to open the editor and navigate back.

**Architecture:** A lazy, concurrency-limited backfill queue runs in the dashboard. For every visible drawing where `preview` is null and the user has edit rights, it fetches the drawing's `content` via `GET /drawings/:id`, renders it with the mermaid singleton, rasterizes the SVG to a PNG data URL, and writes it back with a **preview-only** `PUT /drawings/:id`. All I/O and rendering is injected as dependencies so the queue logic is unit-testable under jsdom, where neither mermaid layout nor canvas rasterization works.

**Tech Stack:** React 18, TypeScript, Vite, mermaid 11, axios, vitest + @testing-library/react, Playwright (e2e).

## Root cause this plan fixes

`drawing.preview` is only ever produced by the browser inside the editor:

- `frontend/src/pages/Editor.tsx:191` — `svgToPngDataUrl(previewSvgRef.current)` is attached to the autosave payload.
- `frontend/src/pages/Editor.tsx:726` — `handleBackClick` forces `saveDrawing(...)` before `navigate('/')`. This is the write that makes the thumbnail appear, which is why it only shows up after pressing Back.
- `backend/src/routes/api/diagrams.ts:63` — the MCP `POST /api/v1/diagrams` handler never sets `preview`, and the MCP server has no mermaid renderer.
- `backend/src/routes/dashboard/drawings.ts:151` — `summarySelect` returns `preview` but not `content`, so a card cannot render a fallback itself.

## Global Constraints

- **`preview` must be a PNG data URL, never raw SVG.** `backend/src/index.ts:388` pipes the field through `sanitizeMermaidSvg` (`backend/src/security.ts:22`), which DOMPurify-sanitizes the string. A base64 PNG data URL survives unchanged; raw mermaid SVG gets attributes stripped. The editor already relies on this.
- **Backfill writes must be preview-only.** In `backend/src/routes/dashboard/drawings.ts:417`, `isSceneUpdate` is `payload.content !== undefined`. A body of `{ preview }` alone therefore does **not** increment `version` and does **not** run the optimistic-concurrency check, so it can never 409 against an open editor. Never include `content`, `name`, `collectionId`, or `version` in a backfill payload.
- **No socket emit on this path.** `app.put("/drawings/:id")` in `backend/src/routes/dashboard/drawings.ts` does not emit `diagrams-changed`; only the MCP routes in `backend/src/routes/api/diagrams.ts` do. `frontend/src/pages/Dashboard.tsx:127` calls `refreshData()` on that event, so keeping the emit absent is what prevents a refresh/backfill loop. Do not add an emit.
- **No backend changes.** The API surface already supports everything needed.
- Max concurrent backfills: **2**. Max attempts per drawing per mount: **1**.
- Rasterization timeout: **10000 ms**.
- Skip drawings in the trash view and drawings where `accessLevel` is `"view"` or `"none"` (`PUT` is gated by `canEditDrawing` at `backend/src/routes/dashboard/drawings.ts:393` and would 404).
- Commands: `make test-frontend` (unit), `make lint-frontend` (lint), `make test-e2e` (Playwright).
- Commit style: Conventional Commits, lowercase subject, signed (`git commit -S`). Never `--no-verify`.

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/utils/previewSvg.ts` (modify) | Mermaid → SVG string. Gains explicit theme handling so it cannot inherit the editor's theme from the shared mermaid singleton. Also exports the frontmatter-theme predicate. |
| `frontend/src/utils/exportUtils.ts` (modify) | SVG → PNG data URL. Gains a rasterization timeout so a never-loading `Image` cannot stall the queue forever. |
| `frontend/src/utils/previewBackfill.ts` (create) | Pure orchestration: candidate selection + dependency-injected, concurrency-limited runner. No React, no mermaid import, no axios import. |
| `frontend/src/utils/__tests__/previewBackfill.test.ts` (create) | Unit tests for the above with fully faked deps. |
| `frontend/src/pages/dashboard/usePreviewBackfill.ts` (create) | React hook: wires the runner to real deps, tracks attempted ids, patches `drawings` state on success. |
| `frontend/src/pages/dashboard/usePreviewBackfill.test.ts` (create) | Hook tests with `vi.mock` on the api module. |
| `frontend/src/pages/Dashboard.tsx` (modify) | Calls the hook. |
| `e2e/tests/preview-backfill.spec.ts` (create) | End-to-end proof: API-created drawing (the MCP path) gets a thumbnail from a dashboard visit alone. |

---

### Task 1: Make mermaid rendering theme-explicit and rasterization timeout-safe

The dashboard shares the global mermaid singleton with the editor. `ensureMermaidInitialized` in `previewSvg.ts` early-returns once initialized, so if the user visited the editor in dark mode first, dashboard renders would silently inherit dark theme. And `svgToCanvas` resolves only from `img.onload`/`img.onerror`, so a browser that fires neither leaves the promise pending forever — which would wedge a queue slot.

**Files:**
- Modify: `frontend/src/utils/previewSvg.ts:1-32`
- Modify: `frontend/src/utils/exportUtils.ts:88-142`
- Modify: `frontend/src/pages/Editor.tsx:143-148`
- Test (create): `frontend/src/utils/__tests__/previewSvgRender.test.ts` — a separate file, because mocking the `mermaid` module has to happen at module scope and `previewSvg.test.ts` deliberately tests the pure string helpers without it.
- Test (create): `frontend/src/utils/__tests__/svgRasterize.test.ts` — same reason: it needs fake timers, which the existing `exportUtils.test.ts` does not use.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `hasFrontmatterTheme(content: string): boolean` (exported from `previewSvg.ts`)
  - `renderMermaidToSvg(content: string, theme?: "default" | "dark"): Promise<string | null>` — now always re-initializes mermaid and always returns style-embedded SVG.
  - `svgToPngDataUrl(svgContent: string, maxSize?: number): Promise<string | null>` — unchanged signature, now resolves `null` after 10s instead of hanging.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/__tests__/previewSvgRender.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasFrontmatterTheme, renderMermaidToSvg } from "../previewSvg";
import mermaid from "mermaid";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({ svg: `<svg id="${id}"><style>a{}</style></svg>` })),
  },
}));

describe("hasFrontmatterTheme", () => {
  it("detects a theme declared in mermaid frontmatter", () => {
    expect(hasFrontmatterTheme("---\nconfig:\n  theme: forest\n---\ngraph TD\n A-->B")).toBe(true);
  });

  it("returns false for plain mermaid source", () => {
    expect(hasFrontmatterTheme("graph TD\n A-->B")).toBe(false);
  });
});

describe("renderMermaidToSvg", () => {
  beforeEach(() => vi.clearAllMocks());

  it("re-initializes mermaid on every call so it cannot inherit another view's theme", async () => {
    await renderMermaidToSvg("graph TD\n A-->B", "default");
    await renderMermaidToSvg("graph TD\n A-->B", "dark");

    expect(vi.mocked(mermaid.initialize)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mermaid.initialize).mock.calls[0][0]).toMatchObject({ theme: "default" });
    expect(vi.mocked(mermaid.initialize).mock.calls[1][0]).toMatchObject({ theme: "dark" });
  });

  it("omits theme so mermaid frontmatter wins when the source declares one", async () => {
    await renderMermaidToSvg("---\nconfig:\n  theme: forest\n---\ngraph TD\n A-->B", "dark");

    expect(vi.mocked(mermaid.initialize).mock.calls[0][0]).not.toHaveProperty("theme");
  });

  it("returns null for empty content without calling mermaid", async () => {
    expect(await renderMermaidToSvg("   ")).toBeNull();
    expect(vi.mocked(mermaid.render)).not.toHaveBeenCalled();
  });
});
```

Create `frontend/src/utils/__tests__/svgRasterize.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { svgToPngDataUrl } from "../exportUtils";

describe("svgToPngDataUrl timeout", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves null instead of hanging when the image never loads", async () => {
    vi.useFakeTimers();
    // jsdom never fires load for a data: SVG, so this promise would otherwise never settle.
    const pending = svgToPngDataUrl('<svg width="100" height="100"></svg>');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npx vitest run src/utils/__tests__/previewSvgRender.test.ts src/utils/__tests__/svgRasterize.test.ts
```

Expected: FAIL — `hasFrontmatterTheme` is not exported, `initialize` is called once not twice, and the timeout test never resolves.

- [ ] **Step 3: Implement in `previewSvg.ts`**

Replace lines 1-32 (the `mermaidInitialized` flag, `ensureMermaidInitialized`, and `renderMermaidToSvg`) with:

```typescript
import mermaid from "mermaid";

let renderCounter = 0;

/**
 * True when the mermaid source declares its own theme in frontmatter.
 *
 * When it does, callers must NOT pass `theme` to mermaid.initialize — the
 * frontmatter value should win.
 */
export const hasFrontmatterTheme = (content: string): boolean =>
  /^---\s*\n[\s\S]*?theme:\s*\S+[\s\S]*?\n---/.test(content);

/**
 * Render mermaid diagram content to a self-contained SVG string.
 * Returns the SVG markup or null if rendering fails.
 *
 * mermaid is a module-level singleton shared with the editor, which
 * re-initializes it with the app theme on every render. We therefore
 * re-initialize on every call rather than memoizing — otherwise a dashboard
 * render could silently inherit the editor's theme.
 */
export const renderMermaidToSvg = async (
  content: string,
  theme: "default" | "dark" = "default"
): Promise<string | null> => {
  if (!content || content.trim().length === 0) return null;

  const trimmed = content.trim();
  try {
    mermaid.initialize({
      startOnLoad: false,
      ...(!hasFrontmatterTheme(trimmed) && { theme }),
      securityLevel: "loose",
    });
    const id = `mermaid-preview-${++renderCounter}`;
    const { svg } = await mermaid.render(id, trimmed);
    return ensureSvgHasStyles(svg);
  } catch (e) {
    console.error("Failed to render mermaid preview:", e);
    return null;
  }
};
```

`ensureSvgHasStyles` is declared later in the same module; function declarations via `const` are hoisted per-module at evaluation time, and `renderMermaidToSvg` only calls it at runtime, so ordering is fine. Leave `ensureSvgHasStyles`, `previewHasEmbeddedImages`, and `normalizePreviewSvg` exactly as they are.

- [ ] **Step 4: Implement the timeout in `exportUtils.ts`**

Add above `svgToCanvas` (around line 87):

```typescript
/** Give up rasterizing an SVG after this long so callers never hang. */
const SVG_RASTERIZE_TIMEOUT_MS = 10_000;
```

Replace the returned promise inside `svgToCanvas` (lines 121-131) with:

```typescript
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(null);
    }, SVG_RASTERIZE_TIMEOUT_MS);

    img.onload = () => {
      clearTimeout(timer);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = svgData;
  });
```

- [ ] **Step 5: Reuse the predicate in the editor**

In `frontend/src/pages/Editor.tsx:29`, extend the existing import:

```typescript
import { ensureSvgHasStyles, hasFrontmatterTheme } from '../utils/previewSvg';
```

Then replace lines 143-144:

```typescript
      // Only set a default theme if the content doesn't specify one in frontmatter
      const hasFrontmatterTheme = /^---\s*\n[\s\S]*?theme:\s*\S+[\s\S]*?\n---/.test(mermaidContent);
```

with:

```typescript
      // Only set a default theme if the content doesn't specify one in frontmatter
      const frontmatterTheme = hasFrontmatterTheme(mermaidContent);
```

and update the spread on line 146 from `...(!hasFrontmatterTheme && {` to `...(!frontmatterTheme && {`.

- [ ] **Step 6: Run tests, lint, and typecheck**

```bash
cd frontend && npx vitest run src/utils src/pages/editor && npx tsc -b --noEmit && npm run lint
```

Expected: PASS, no type errors, no new lint errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/previewSvg.ts frontend/src/utils/exportUtils.ts \
        frontend/src/pages/Editor.tsx \
        frontend/src/utils/__tests__/previewSvgRender.test.ts \
        frontend/src/utils/__tests__/svgRasterize.test.ts
git commit -S -m "refactor: make mermaid preview rendering theme-explicit and timeout-safe"
```

---

### Task 2: Preview backfill queue (pure, dependency-injected)

This is the whole decision logic, with zero imports from mermaid, axios, or React so it runs under jsdom.

**Files:**
- Create: `frontend/src/utils/previewBackfill.ts`
- Test: `frontend/src/utils/__tests__/previewBackfill.test.ts`

**Interfaces:**
- Consumes: `DrawingSummary` from `frontend/src/types/index.ts` (fields used: `id`, `preview`, `accessLevel`).
- Produces:

```typescript
export type PreviewCandidate = Pick<DrawingSummary, "id" | "preview" | "accessLevel">;

export type PreviewBackfillDeps = {
  fetchContent: (id: string) => Promise<string>;
  renderSvg: (content: string) => Promise<string | null>;
  toPng: (svg: string) => Promise<string | null>;
  savePreview: (id: string, preview: string) => Promise<void>;
  onSaved: (id: string, preview: string) => void;
  onFailed: (id: string, reason: unknown) => void;
  isCancelled: () => boolean;
};

export const selectPreviewCandidates: (
  drawings: PreviewCandidate[],
  options: { attempted: ReadonlySet<string>; skipAll?: boolean; limit?: number }
) => string[];

export const runPreviewBackfill: (
  ids: string[],
  deps: PreviewBackfillDeps,
  options?: { concurrency?: number }
) => Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/__tests__/previewBackfill.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runPreviewBackfill,
  selectPreviewCandidates,
  type PreviewBackfillDeps,
} from "../previewBackfill";

const candidate = (id: string, over: Partial<{ preview: string | null; accessLevel: string }> = {}) => ({
  id,
  preview: null as string | null,
  ...over,
}) as Parameters<typeof selectPreviewCandidates>[0][number];

describe("selectPreviewCandidates", () => {
  it("picks drawings with no preview", () => {
    const result = selectPreviewCandidates(
      [candidate("a"), candidate("b", { preview: "data:image/png;base64,xxx" })],
      { attempted: new Set() }
    );
    expect(result).toEqual(["a"]);
  });

  it("treats an empty-string preview as missing", () => {
    expect(selectPreviewCandidates([candidate("a", { preview: "" })], { attempted: new Set() }))
      .toEqual(["a"]);
  });

  it("never retries an id already attempted this session", () => {
    expect(selectPreviewCandidates([candidate("a")], { attempted: new Set(["a"]) })).toEqual([]);
  });

  it("skips drawings the user cannot edit, because PUT would 404", () => {
    const result = selectPreviewCandidates(
      [
        candidate("view", { accessLevel: "view" }),
        candidate("none", { accessLevel: "none" }),
        candidate("edit", { accessLevel: "edit" }),
        candidate("owner", { accessLevel: "owner" }),
        candidate("own"),
      ],
      { attempted: new Set() }
    );
    expect(result).toEqual(["edit", "owner", "own"]);
  });

  it("returns nothing when the current view is excluded", () => {
    expect(selectPreviewCandidates([candidate("a")], { attempted: new Set(), skipAll: true }))
      .toEqual([]);
  });

  it("caps the batch at the given limit", () => {
    const many = ["a", "b", "c", "d"].map((id) => candidate(id));
    expect(selectPreviewCandidates(many, { attempted: new Set(), limit: 2 })).toEqual(["a", "b"]);
  });
});

describe("runPreviewBackfill", () => {
  let deps: PreviewBackfillDeps;

  beforeEach(() => {
    deps = {
      fetchContent: vi.fn(async (id) => `graph TD\n ${id}`),
      renderSvg: vi.fn(async () => "<svg/>"),
      toPng: vi.fn(async () => "data:image/png;base64,ok"),
      savePreview: vi.fn(async () => {}),
      onSaved: vi.fn(),
      onFailed: vi.fn(),
      isCancelled: vi.fn(() => false),
    };
  });

  it("renders, rasterizes, saves and reports each id", async () => {
    await runPreviewBackfill(["a"], deps);

    expect(deps.fetchContent).toHaveBeenCalledWith("a");
    expect(deps.renderSvg).toHaveBeenCalledWith("graph TD\n a");
    expect(deps.toPng).toHaveBeenCalledWith("<svg/>");
    expect(deps.savePreview).toHaveBeenCalledWith("a", "data:image/png;base64,ok");
    expect(deps.onSaved).toHaveBeenCalledWith("a", "data:image/png;base64,ok");
    expect(deps.onFailed).not.toHaveBeenCalled();
  });

  it("reports a failure and keeps processing the rest when one render fails", async () => {
    deps.renderSvg = vi.fn(async (content: string) =>
      content.includes("bad") ? null : "<svg/>"
    );

    await runPreviewBackfill(["bad", "good"], deps);

    expect(deps.onFailed).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.onFailed).mock.calls[0][0]).toBe("bad");
    expect(deps.savePreview).toHaveBeenCalledTimes(1);
    expect(deps.savePreview).toHaveBeenCalledWith("good", "data:image/png;base64,ok");
  });

  it("reports a failure when the save request rejects", async () => {
    deps.savePreview = vi.fn(async () => {
      throw new Error("403");
    });

    await runPreviewBackfill(["a"], deps);

    expect(deps.onFailed).toHaveBeenCalledTimes(1);
    expect(deps.onSaved).not.toHaveBeenCalled();
  });

  it("never exceeds the configured concurrency", async () => {
    let active = 0;
    let peak = 0;
    deps.fetchContent = vi.fn(async (id: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
      return `graph TD\n ${id}`;
    });

    await runPreviewBackfill(["a", "b", "c", "d", "e"], deps, { concurrency: 2 });

    expect(peak).toBeLessThanOrEqual(2);
    expect(deps.savePreview).toHaveBeenCalledTimes(5);
  });

  it("stops early once cancelled, so an unmounted dashboard does not keep writing", async () => {
    deps.isCancelled = vi.fn(() => true);

    await runPreviewBackfill(["a", "b"], deps);

    expect(deps.fetchContent).not.toHaveBeenCalled();
    expect(deps.savePreview).not.toHaveBeenCalled();
    expect(deps.onFailed).not.toHaveBeenCalled();
  });

  it("resolves without work for an empty id list", async () => {
    await expect(runPreviewBackfill([], deps)).resolves.toBeUndefined();
    expect(deps.fetchContent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npx vitest run src/utils/__tests__/previewBackfill.test.ts
```

Expected: FAIL — `Failed to resolve import "../previewBackfill"`.

- [ ] **Step 3: Implement `previewBackfill.ts`**

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npx vitest run src/utils/__tests__/previewBackfill.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/previewBackfill.ts frontend/src/utils/__tests__/previewBackfill.test.ts
git commit -S -m "feat: add dependency-injected preview backfill queue"
```

---

### Task 3: `usePreviewBackfill` hook

**Files:**
- Create: `frontend/src/pages/dashboard/usePreviewBackfill.ts`
- Test: `frontend/src/pages/dashboard/usePreviewBackfill.test.ts`

**Interfaces:**
- Consumes: `selectPreviewCandidates`, `runPreviewBackfill`, `PreviewBackfillDeps` from `frontend/src/utils/previewBackfill.ts`; `renderMermaidToSvg` from `frontend/src/utils/previewSvg.ts`; `svgToPngDataUrl` from `frontend/src/utils/exportUtils.ts`; `getDrawing` and `updateDrawing` from `frontend/src/api`.
- Produces:

```typescript
export const usePreviewBackfill: (options: {
  drawings: DrawingSummary[];
  setDrawings: React.Dispatch<React.SetStateAction<DrawingSummary[]>>;
  enabled: boolean;
  theme?: "default" | "dark";
}) => void;
```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/dashboard/usePreviewBackfill.test.ts`:

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import * as previewSvg from "../../utils/previewSvg";
import * as exportUtils from "../../utils/exportUtils";
import type { DrawingSummary } from "../../types";
import { usePreviewBackfill } from "./usePreviewBackfill";

vi.mock("../../api", () => ({
  getDrawing: vi.fn(),
  updateDrawing: vi.fn(),
}));
vi.mock("../../utils/previewSvg", () => ({ renderMermaidToSvg: vi.fn() }));
vi.mock("../../utils/exportUtils", () => ({ svgToPngDataUrl: vi.fn() }));

const PNG = "data:image/png;base64,ok";

const drawing = (id: string, over: Partial<DrawingSummary> = {}): DrawingSummary => ({
  id,
  name: id,
  collectionId: null,
  createdAt: 1,
  updatedAt: 1,
  version: 1,
  preview: null,
  ...over,
});

describe("usePreviewBackfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDrawing).mockResolvedValue({
      ...drawing("a"),
      content: "graph TD\n A-->B",
    } as Awaited<ReturnType<typeof api.getDrawing>>);
    vi.mocked(api.updateDrawing).mockResolvedValue(
      drawing("a") as Awaited<ReturnType<typeof api.updateDrawing>>
    );
    vi.mocked(previewSvg.renderMermaidToSvg).mockResolvedValue("<svg/>");
    vi.mocked(exportUtils.svgToPngDataUrl).mockResolvedValue(PNG);
  });

  const setup = (initial: DrawingSummary[], enabled = true) => {
    const state = { drawings: initial };
    const setDrawings = vi.fn((updater: unknown) => {
      state.drawings =
        typeof updater === "function"
          ? (updater as (p: DrawingSummary[]) => DrawingSummary[])(state.drawings)
          : (updater as DrawingSummary[]);
    });
    const hook = renderHook(() =>
      usePreviewBackfill({
        drawings: initial,
        setDrawings: setDrawings as never,
        enabled,
      })
    );
    return { state, setDrawings, hook };
  };

  it("sends a preview-only update, never content or version", async () => {
    setup([drawing("a")]);

    await waitFor(() => expect(api.updateDrawing).toHaveBeenCalledTimes(1));

    expect(api.updateDrawing).toHaveBeenCalledWith("a", { preview: PNG });
    const payload = vi.mocked(api.updateDrawing).mock.calls[0][1];
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("version");
  });

  it("patches the generated preview into dashboard state", async () => {
    const { state } = setup([drawing("a"), drawing("b", { preview: PNG })]);

    await waitFor(() => expect(state.drawings[0].preview).toBe(PNG));
    expect(state.drawings[1].preview).toBe(PNG);
  });

  it("skips drawings that already have a preview", async () => {
    setup([drawing("a", { preview: PNG })]);

    await waitFor(() => expect(previewSvg.renderMermaidToSvg).not.toHaveBeenCalled());
    expect(api.updateDrawing).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", async () => {
    setup([drawing("a")], false);

    await waitFor(() => expect(api.getDrawing).not.toHaveBeenCalled());
  });

  it("does not retry a drawing whose render failed", async () => {
    vi.mocked(previewSvg.renderMermaidToSvg).mockResolvedValue(null);
    const { hook } = setup([drawing("a")]);

    await waitFor(() => expect(previewSvg.renderMermaidToSvg).toHaveBeenCalledTimes(1));

    hook.rerender();
    await waitFor(() => expect(previewSvg.renderMermaidToSvg).toHaveBeenCalledTimes(1));
    expect(api.updateDrawing).not.toHaveBeenCalled();
  });

  it("does not re-attempt an id it already generated on rerender", async () => {
    const { hook } = setup([drawing("a")]);

    await waitFor(() => expect(api.updateDrawing).toHaveBeenCalledTimes(1));

    hook.rerender();
    await waitFor(() => expect(api.updateDrawing).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/dashboard/usePreviewBackfill.test.ts
```

Expected: FAIL — `Failed to resolve import "./usePreviewBackfill"`.

- [ ] **Step 3: Implement the hook**

```typescript
import { useCallback, useEffect, useRef } from "react";
import * as api from "../../api";
import type { DrawingSummary } from "../../types";
import { svgToPngDataUrl } from "../../utils/exportUtils";
import { renderMermaidToSvg } from "../../utils/previewSvg";
import {
  runPreviewBackfill,
  selectPreviewCandidates,
  type PreviewBackfillDeps,
} from "../../utils/previewBackfill";

/** Cards filled per pass. Keeps a large first page from flooding the API. */
const BATCH_SIZE = 8;
const CONCURRENCY = 2;

type UsePreviewBackfillOptions = {
  drawings: DrawingSummary[];
  setDrawings: React.Dispatch<React.SetStateAction<DrawingSummary[]>>;
  /** False for the trash view, where thumbnails are not worth generating. */
  enabled: boolean;
  theme?: "default" | "dark";
};

/**
 * Generate missing dashboard thumbnails in the browser and persist them.
 *
 * Drawings created outside the editor — via the MCP server, import, or the
 * public API — have no `preview`, because only the editor produces one. Without
 * this, such cards stay blank until someone opens them in the editor and
 * navigates back, which is what triggers the editor's save.
 *
 * The write is a preview-only PUT: the backend does not treat it as a scene
 * update, so it neither bumps `version` nor emits `diagrams-changed`. That is
 * what keeps this from conflicting with an open editor or looping against the
 * dashboard's own socket refresh.
 */
export const usePreviewBackfill = ({
  drawings,
  setDrawings,
  enabled,
  theme = "default",
}: UsePreviewBackfillOptions): void => {
  const attemptedRef = useRef<Set<string>>(new Set());
  const isRunningRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const applyPreview = useCallback(
    (id: string, preview: string) => {
      setDrawings((prev) =>
        prev.map((d) => (d.id === id ? { ...d, preview } : d))
      );
    },
    [setDrawings]
  );

  useEffect(() => {
    if (!enabled || isRunningRef.current) return;

    const ids = selectPreviewCandidates(drawings, {
      attempted: attemptedRef.current,
      limit: BATCH_SIZE,
    });
    if (ids.length === 0) return;

    // Claim the ids up front so a re-render mid-run cannot queue them twice.
    ids.forEach((id) => attemptedRef.current.add(id));
    isRunningRef.current = true;

    const deps: PreviewBackfillDeps = {
      fetchContent: async (id) => (await api.getDrawing(id)).content,
      renderSvg: (content) => renderMermaidToSvg(content, theme),
      toPng: (svg) => svgToPngDataUrl(svg),
      savePreview: async (id, preview) => {
        await api.updateDrawing(id, { preview });
      },
      onSaved: applyPreview,
      onFailed: (id, reason) => {
        console.warn(`Preview backfill failed for drawing ${id}:`, reason);
      },
      isCancelled: () => cancelledRef.current,
    };

    runPreviewBackfill(ids, deps, { concurrency: CONCURRENCY }).finally(() => {
      isRunningRef.current = false;
    });
  }, [drawings, enabled, theme, applyPreview]);
};
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/dashboard
```

Expected: PASS — the new file plus the existing `useDashboardData` and `pagination` suites.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/usePreviewBackfill.ts \
        frontend/src/pages/dashboard/usePreviewBackfill.test.ts
git commit -S -m "feat: add usePreviewBackfill hook for missing dashboard thumbnails"
```

---

### Task 4: Wire into the dashboard and prove it end to end

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx` (import block near line 13; hook call after the `useDashboardData` destructure that ends at line 87)
- Modify: `e2e/tests/helpers/api.ts:110-118` (`CreateDrawingOptions`)
- Create: `e2e/tests/preview-backfill.spec.ts`

**Interfaces:**
- Consumes: `usePreviewBackfill` from `./dashboard/usePreviewBackfill`, plus `drawings`, `setDrawings`, and `selectedCollectionId` already present in `Dashboard.tsx`. From `e2e/tests/helpers/api.ts`: `createDrawing(request, overrides?)`, `getDrawing(request, id)`, `deleteDrawing(request, id)` — these already handle CSRF and the `API_URL` prefix, and the e2e suite needs no explicit login (`e2e/global-setup.ts` completes auth onboarding, and other specs just call `page.goto("/")`).
- Produces: no new exports.

- [ ] **Step 1: Let the e2e helper pass mermaid source**

`CreateDrawingOptions` in `e2e/tests/helpers/api.ts:110` still carries only the legacy scene fields, but `drawingCreateSchema` (`backend/src/index.ts:365`) accepts `content`. Add the field to the interface:

```typescript
export interface CreateDrawingOptions {
  name?: string;
  content?: string;
  elements?: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
  preview?: string | null;
  collectionId?: string | null;
}
```

`createDrawing` already spreads `overrides` over `defaultDrawingPayload()`, so no other change is needed.

- [ ] **Step 2: Write the failing e2e test**

Create `e2e/tests/preview-backfill.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";
import { createDrawing, deleteDrawing, getDrawing } from "./helpers/api";

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
```

- [ ] **Step 3: Run the e2e test to verify it fails**

```bash
make test-e2e -- e2e/tests/preview-backfill.spec.ts
```

Expected: FAIL — the card renders the `GitBranch` fallback, so no `img` appears and `preview` stays null.

- [ ] **Step 4: Wire the hook into `Dashboard.tsx`**

Add to the import block after line 13:

```typescript
import { usePreviewBackfill } from './dashboard/usePreviewBackfill';
```

Immediately after the closing `});` of the `useDashboardData({ ... })` call (line 87 onward), insert:

```typescript
  // Drawings created outside the editor (MCP, import, API) arrive with no
  // preview. Generate the missing thumbnails here so cards are not blank until
  // someone opens the editor and navigates back.
  usePreviewBackfill({
    drawings,
    setDrawings,
    enabled: selectedCollectionId !== 'trash',
  });
```

`selectedCollectionId` is already in scope from line 23. Do **not** move the `isTrashView` / `isSharedView` constants up from line 289 — read-only shared drawings are filtered inside `selectPreviewCandidates` by `accessLevel`, so the view flag is not needed here.

- [ ] **Step 5: Run the e2e test to verify it passes**

```bash
make test-e2e -- e2e/tests/preview-backfill.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full unit, lint, and typecheck sweep**

```bash
make test-frontend
make lint-frontend
cd frontend && npx tsc -b --noEmit
```

Expected: all green, including the pre-existing `previewSvg`, `exportUtils`, `useDashboardData`, and `pagination` suites.

- [ ] **Step 7: Manual verification against the real MCP path**

```bash
make dev
```

Then create a diagram through the MCP server (`create_diagram`), keep the dashboard open, and confirm the card's thumbnail appears on its own without opening the editor. Also confirm in the browser devtools Network tab that the `PUT /api/drawings/:id` request body contains **only** `preview`, and that no `diagrams-changed` socket event follows it.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx e2e/tests/preview-backfill.spec.ts e2e/tests/helpers/api.ts
git commit -S -m "feat: backfill missing dashboard thumbnails for api-created diagrams"
```

---

## Self-review notes

- **Coverage:** the reported symptom (blank card until Back is pressed) is covered by Task 4's e2e test; the shared mermaid-singleton theme hazard by Task 1; queue safety (concurrency, cancellation, no-retry, per-item failure isolation) by Task 2; the preview-only-payload invariant by Task 3's first test.
- **Known limitation, by design:** generation requires a logged-in browser with the dashboard open. A diagram created via MCP while no browser is open stays blank until the next dashboard visit. Server-side rendering would be needed to remove that, and it costs a headless Chromium in the backend image — deliberately out of scope here.
- **Not addressed:** `normalizePreviewSvg` and `previewHasEmbeddedImages` in `previewSvg.ts` remain used only by their own tests. They are leftovers from an earlier dashboard-side SVG rendering approach. Removing them is a separate cleanup; this plan does not need them because previews are PNGs.
