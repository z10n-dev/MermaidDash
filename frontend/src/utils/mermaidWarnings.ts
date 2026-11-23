/**
 * Fork customization (z10n-dev/MermaidDash): hide Mermaid warning blocks.
 *
 * Upstream paints three kinds of blocks when a diagram has a problem:
 *   1. mermaid's own in-canvas error diagram (rendered into the SVG/DOM),
 *   2. the full-panel "Diagram Error" block in the editor canvas,
 *   3. the "Syntax error — showing last valid diagram" toast.
 *
 * In this fork all of them are hidden by default, so typing temporarily
 * invalid mermaid code never covers the canvas with warning blocks: the last
 * valid diagram simply stays on screen.
 *
 * Restore upstream behaviour by building with `VITE_SHOW_MERMAID_WARNINGS=1`
 * (Docker build arg: `--build-arg SHOW_MERMAID_WARNINGS=1`).
 */
const rawFlag = import.meta.env.VITE_SHOW_MERMAID_WARNINGS;

export const SHOW_MERMAID_WARNINGS = rawFlag === '1' || rawFlag === 'true';

/**
 * Passed to `mermaid.initialize()` as `suppressErrorRendering`.
 * When warnings are visible we keep mermaid's default (false/upstream).
 */
export const SUPPRESS_MERMAID_ERROR_RENDERING = !SHOW_MERMAID_WARNINGS;
