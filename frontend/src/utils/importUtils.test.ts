import { describe, it, expect, vi, beforeEach } from "vitest";

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("../api", () => ({
  api: {
    get: (...args: any[]) => apiGet(...args),
    post: (...args: any[]) => apiPost(...args),
  },
}));

import { importDrawings } from "./importUtils";

describe("importDrawings", () => {
  const makeTextFile = (text: string, name: string) =>
    ({
      name,
      text: async () => text,
    }) as unknown as File;

  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
  });

  it("imports a .mmd file as a drawing", async () => {
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/drawings") return { data: { success: true } };
      throw new Error(`Unexpected POST ${url}`);
    });

    const file = makeTextFile("graph TD\n    A --> B", "flowchart.mmd");

    const result = await importDrawings([file], null);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(1);

    const drawCalls = apiPost.mock.calls.filter((c) => c[0] === "/drawings");
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0][1].name).toBe("flowchart");
    expect(drawCalls[0][1].content).toBe("graph TD\n    A --> B");
  });

  it("imports a .mermaid.json file as a drawing", async () => {
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/drawings") return { data: { success: true } };
      throw new Error(`Unexpected POST ${url}`);
    });

    const mermaidJson = JSON.stringify({
      type: "mermaid",
      content: "sequenceDiagram\n    A->>B: Hello",
      version: 1,
    });
    const file = makeTextFile(mermaidJson, "sequence.mermaid.json");

    const result = await importDrawings([file], null);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(1);

    const drawCalls = apiPost.mock.calls.filter((c) => c[0] === "/drawings");
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0][1].name).toBe("sequence");
    expect(drawCalls[0][1].content).toBe("sequenceDiagram\n    A->>B: Hello");
  });

  it("assigns targetCollectionId to imported drawings", async () => {
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/drawings") return { data: { success: true } };
      throw new Error(`Unexpected POST ${url}`);
    });

    const file = makeTextFile("graph LR\n    X --> Y", "test.mmd");

    const result = await importDrawings([file], "col-123");
    expect(result.failed).toBe(0);
    expect(result.success).toBe(1);

    const drawCalls = apiPost.mock.calls.filter((c) => c[0] === "/drawings");
    expect(drawCalls[0][1].collectionId).toBe("col-123");
  });

  it("rejects unsupported file types", async () => {
    const file = makeTextFile("{}", "data.json");

    const result = await importDrawings([file], null);
    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No supported files");
  });

  it("rejects .mermaid.json with invalid structure", async () => {
    apiPost.mockImplementation(async () => {
      throw new Error("Should not be called");
    });

    const invalidJson = JSON.stringify({ foo: "bar" });
    const file = makeTextFile(invalidJson, "bad.mermaid.json");

    const result = await importDrawings([file], null);
    expect(result.failed).toBe(1);
    expect(result.success).toBe(0);
  });

  it("rejects empty .mmd files", async () => {
    const file = makeTextFile("   ", "empty.mmd");

    const result = await importDrawings([file], null);
    expect(result.failed).toBe(1);
    expect(result.success).toBe(0);
  });
});
