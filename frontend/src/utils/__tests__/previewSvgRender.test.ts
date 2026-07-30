import { beforeEach, describe, expect, it, vi } from "vitest";
import mermaid from "mermaid";
import { hasFrontmatterTheme, renderMermaidToSvg } from "../previewSvg";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg id="${id}"><style>a{}</style></svg>`,
    })),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
