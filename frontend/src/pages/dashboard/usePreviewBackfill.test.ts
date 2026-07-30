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
