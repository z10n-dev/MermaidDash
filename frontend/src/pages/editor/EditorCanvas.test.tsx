import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Fork behaviour: warning/error blocks hidden by default.
vi.mock("../../utils/mermaidWarnings", () => ({
  SHOW_MERMAID_WARNINGS: false,
  SUPPRESS_MERMAID_ERROR_RENDERING: true,
}));

import { EditorCanvas } from "./EditorCanvas";

const renderCanvas = (previewSvg: string, previewError: string | null) =>
  render(
    <EditorCanvas
      previewSvg={previewSvg}
      previewError={previewError}
      toolMode="pan"
      initSvgPanZoom={() => {}}
    />
  );

describe("EditorCanvas mermaid warning blocks (fork)", () => {
  it("hides the full-panel Diagram Error block", () => {
    const { container } = renderCanvas("", "Parse error on line 2");

    expect(container.textContent).not.toContain("Diagram Error");
    expect(container.textContent).not.toContain("Parse error on line 2");
  });

  it("hides the 'Syntax error' toast when the last valid diagram is shown", () => {
    const { container } = renderCanvas("<svg></svg>", "Parse error on line 2");

    expect(container.textContent).not.toContain("Syntax error");
  });
});
