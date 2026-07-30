import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runPreviewBackfill,
  selectPreviewCandidates,
  type PreviewBackfillDeps,
  type PreviewCandidate,
} from "../previewBackfill";

const candidate = (
  id: string,
  over: Partial<PreviewCandidate> = {}
): PreviewCandidate => ({
  id,
  preview: null,
  ...over,
});

describe("selectPreviewCandidates", () => {
  it("picks drawings with no preview", () => {
    const result = selectPreviewCandidates(
      [candidate("a"), candidate("b", { preview: "data:image/png;base64,xxx" })],
      { attempted: new Set() }
    );
    expect(result).toEqual(["a"]);
  });

  it("treats an empty-string preview as missing", () => {
    expect(
      selectPreviewCandidates([candidate("a", { preview: "" })], { attempted: new Set() })
    ).toEqual(["a"]);
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
    expect(
      selectPreviewCandidates([candidate("a")], { attempted: new Set(), skipAll: true })
    ).toEqual([]);
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
      fetchContent: vi.fn(async (id: string) => `graph TD\n ${id}`),
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
