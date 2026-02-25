import { describe, expect, it } from "vitest";
import { normalizePreviewSvg, previewHasEmbeddedImages } from "../previewSvg";

// Realistic mermaid v11 SVG with embedded <style> (as returned by mermaid.render() on first call)
const MERMAID_V11_SVG_WITH_STYLES = [
  '<svg id="mermaid-preview-2" xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 -50 1082 1685" style="max-width: 1082px; overflow: hidden;" aria-roledescription="flowchart-v2">',
  '<style>#mermaid-preview-2{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#333;}',
  "#mermaid-preview-2 .node rect{fill:#ECECFF;stroke:#9370DB;stroke-width:1px;}",
  "#mermaid-preview-2 .node .label{text-align:center;}",
  "#mermaid-preview-2 .edgePath .path{stroke:#333;stroke-width:2px;}",
  "</style>",
  '<g><g id="flowchart" data-look="classic">',
  '<g id="nodeA"><rect x="10" y="10" width="100" height="40" class="node"></rect>',
  "<text>Start</text></g>",
  '<g id="nodeB"><rect x="10" y="100" width="100" height="40" class="node"></rect>',
  "<text>End</text></g>",
  '<path class="edgePath" d="M60,50 L60,100"></path>',
  "</g></g></svg>",
].join("");

// Same SVG but WITHOUT <style> (as returned by mermaid.render() on subsequent calls with new IDs)
const MERMAID_V11_SVG_WITHOUT_STYLES = [
  '<svg id="mermaid-save-preview-12345" xmlns="http://www.w3.org/2000/svg" viewBox="0 -50 1082 1685" aria-roledescription="flowchart-v2">',
  '<g><g id="flowchart" data-look="classic">',
  '<g id="nodeA"><rect x="10" y="10" width="100" height="40" class="node"></rect>',
  "<text>Start</text></g>",
  '<g id="nodeB"><rect x="10" y="100" width="100" height="40" class="node"></rect>',
  "<text>End</text></g>",
  '<path class="edgePath" d="M60,50 L60,100"></path>',
  "</g></g></svg>",
].join("");

describe("normalizePreviewSvg", () => {
  it("returns null for null/undefined/empty", () => {
    expect(normalizePreviewSvg(null)).toBe(null);
    expect(normalizePreviewSvg(undefined)).toBe(null);
    expect(normalizePreviewSvg("")).toBe(null);
    expect(normalizePreviewSvg("  ")).toBe(null);
  });

  it("returns input unchanged if no <svg> tag found", () => {
    expect(normalizePreviewSvg("<div>not svg</div>")).toBe("<div>not svg</div>");
  });

  it("adds viewBox from width/height when missing", () => {
    const raw = '<svg width="800" height="600"><rect/></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).toContain('viewBox="0 0 800 600"');
  });

  it("leaves existing viewBox unchanged", () => {
    const raw = '<svg viewBox="0 0 100 50" width="200" height="100"><rect/></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).toContain('viewBox="0 0 100 50"');
    expect(normalized.match(/viewBox/g)?.length).toBe(1);
  });

  it("adds preserveAspectRatio when missing", () => {
    const raw = '<svg viewBox="0 0 100 50"><rect/></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("leaves existing preserveAspectRatio unchanged", () => {
    const raw = '<svg viewBox="0 0 100 50" preserveAspectRatio="xMinYMin"><rect/></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).toContain('preserveAspectRatio="xMinYMin"');
    expect(normalized.match(/preserveAspectRatio/g)?.length).toBe(1);
  });

  it("removes width and height attributes", () => {
    const raw = '<svg width="955.33" height="400" viewBox="0 0 955 400"><rect/></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).not.toMatch(/\bwidth\s*=/);
    expect(normalized).not.toMatch(/\bheight\s*=/);
  });

  it("removes max-width and overflow from inline styles", () => {
    const raw = '<svg style="max-width: 955px; overflow: hidden; color: red" viewBox="0 0 100 50"><rect/></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).not.toContain("max-width");
    expect(normalized).not.toContain("overflow");
    expect(normalized).toContain("color: red");
  });

  it("removes style attribute entirely if only restricted props", () => {
    const raw = '<svg style="max-width: 955px; overflow: hidden" viewBox="0 0 100 50"><rect/></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).not.toContain("style=");
  });

  it("preserves SVG content and structure", () => {
    const raw = '<svg viewBox="0 0 100 50"><g><rect x="10" y="20" width="30" height="40" fill="#ff0000"/><text>Hello</text></g></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).toContain('fill="#ff0000"');
    expect(normalized).toContain("<text>Hello</text>");
  });

  it("makes white rects transparent when images are present", () => {
    const raw = [
      '<svg viewBox="0 0 500 700">',
      '<rect x="0" y="0" width="500" height="700" fill="#ffffff"></rect>',
      '<image href="data:image/png;base64,AAAA"></image>',
      "</svg>",
    ].join("");

    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).toContain('fill="transparent"');
    expect(normalized).not.toContain('fill="#ffffff"');
  });

  it("does NOT make white rects transparent when no images present", () => {
    const raw = '<svg viewBox="0 0 500 700"><rect x="0" y="0" width="500" height="700" fill="#ffffff"></rect></svg>';
    const normalized = normalizePreviewSvg(raw)!;
    expect(normalized).toContain('fill="#ffffff"');
  });

  // === Critical mermaid v11 tests ===

  it("preserves <style> elements inside SVG (mermaid v11 CSS)", () => {
    const normalized = normalizePreviewSvg(MERMAID_V11_SVG_WITH_STYLES)!;
    expect(normalized).toContain("<style>");
    expect(normalized).toContain("</style>");
    expect(normalized).toContain("fill:#ECECFF");
    expect(normalized).toContain("stroke:#9370DB");
    expect(normalized).toContain('font-family:"trebuchet ms"');
  });

  it("preserves the SVG id referenced by <style> selectors", () => {
    const normalized = normalizePreviewSvg(MERMAID_V11_SVG_WITH_STYLES)!;
    // The <style> uses #mermaid-preview-2 selectors — the id must be preserved
    expect(normalized).toContain('id="mermaid-preview-2"');
    expect(normalized).toContain("#mermaid-preview-2 .node rect");
  });

  it("removes width/height but keeps <style> intact", () => {
    const normalized = normalizePreviewSvg(MERMAID_V11_SVG_WITH_STYLES)!;
    // width="100%" should be removed
    expect(normalized).not.toMatch(/\bwidth\s*=\s*"100%"/);
    // max-width in inline style should be removed
    expect(normalized).not.toContain("max-width");
    // But <style> element CSS should remain untouched
    expect(normalized).toContain("#mermaid-preview-2 .node rect{fill:#ECECFF;stroke:#9370DB");
  });

  it("preserves data-look attributes (mermaid v11)", () => {
    const normalized = normalizePreviewSvg(MERMAID_V11_SVG_WITH_STYLES)!;
    expect(normalized).toContain('data-look="classic"');
  });

  it("double normalization does not strip <style>", () => {
    // Preview is normalized on save AND on load — verify idempotency
    const first = normalizePreviewSvg(MERMAID_V11_SVG_WITH_STYLES)!;
    const second = normalizePreviewSvg(first)!;
    expect(second).toContain("<style>");
    expect(second).toContain("fill:#ECECFF");
    expect(second).toContain("#mermaid-preview-2 .node rect");
  });

  it("SVG without <style> has NO fill information (the bug)", () => {
    // This test documents the mermaid v11 behavior: when mermaid.render() is called
    // with a new ID after styles were already injected into the document head for
    // a different ID, the returned SVG has NO <style> and NO inline fill attributes.
    // Rendering this SVG in isolation produces all-black shapes.
    const normalized = normalizePreviewSvg(MERMAID_V11_SVG_WITHOUT_STYLES)!;
    expect(normalized).not.toContain("<style>");
    expect(normalized).not.toContain("fill:");
    expect(normalized).not.toContain('fill="');
    // This SVG will render as all-black when displayed outside the editor
  });

  it("SVG with <style> IS self-contained and renderable", () => {
    // The SVG from the first mermaid.render() call includes <style> with all
    // CSS rules. This SVG can be rendered standalone (export, dashboard preview).
    const normalized = normalizePreviewSvg(MERMAID_V11_SVG_WITH_STYLES)!;
    expect(normalized).toContain("<style>");
    expect(normalized).toContain("fill:#ECECFF");
    // Has viewBox for proper scaling
    expect(normalized).toContain("viewBox=");
    // Has preserveAspectRatio
    expect(normalized).toContain("preserveAspectRatio=");
    // No fixed dimensions on the <svg> tag itself (inner elements can have width/height)
    const svgTag = normalized.match(/^<svg\b[^>]*>/)![0];
    expect(svgTag).not.toMatch(/\bwidth\s*=/);
    expect(svgTag).not.toMatch(/\bheight\s*=/);
  });
});

describe("previewHasEmbeddedImages", () => {
  it("returns true for SVGs with <image> tags", () => {
    expect(previewHasEmbeddedImages('<svg><image href="test.png"></image></svg>')).toBe(true);
    expect(previewHasEmbeddedImages('<svg><image href="test.png"/></svg>')).toBe(true);
  });

  it("returns false for SVGs without <image> tags", () => {
    expect(previewHasEmbeddedImages("<svg><rect/></svg>")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(previewHasEmbeddedImages(null)).toBe(false);
    expect(previewHasEmbeddedImages(undefined)).toBe(false);
  });
});
