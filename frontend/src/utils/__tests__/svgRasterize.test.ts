import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { svgToPngDataUrl } from "../exportUtils";

describe("svgToPngDataUrl rasterization", () => {
  beforeEach(() => {
    // jsdom has no canvas implementation, so getContext("2d") returns null and
    // svgToCanvas would bail out before it ever constructs an Image. Stub just
    // enough of the canvas API to reach the rasterization path under test.
    const ctx = {
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,stub"
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves null instead of hanging when the image never loads", async () => {
    vi.useFakeTimers();
    // jsdom never fires load or error for a data: SVG, so without a timeout
    // this promise would never settle.
    const pending = svgToPngDataUrl('<svg width="100" height="100"></svg>');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeNull();
  });
});
