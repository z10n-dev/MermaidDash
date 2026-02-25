import { describe, expect, it } from "vitest";
import { sanitizeDrawingUpdateData } from "../index";

describe("sanitizeDrawingUpdateData regression", () => {
  it("does not inject empty scene fields for preview-only updates", () => {
    const payload: {
      preview?: string | null;
    } = {
      preview: "<svg><rect width=\"10\" height=\"10\"/></svg>",
    };

    const ok = sanitizeDrawingUpdateData(payload);
    expect(ok).toBe(true);
    expect(typeof payload.preview).toBe("string");
    expect(String(payload.preview)).toContain("<svg");
  });

  it("still sanitizes preview when provided with content", () => {
    const payload: {
      preview?: string | null;
      content?: string;
    } = {
      content: "graph TD\n    A[Start] --> B[End]",
      preview: "<svg/>",
    };

    const ok = sanitizeDrawingUpdateData(payload);
    expect(ok).toBe(true);
    expect(typeof payload.preview).toBe("string");
  });
});
