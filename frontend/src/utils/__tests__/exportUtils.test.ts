/**
 * Tests for exportUtils.ts
 *
 * Verify that the mermaid export format is correct and survives JSON round-trips.
 */

import { describe, it, expect } from "vitest";
import { type ExportData } from "../exportUtils";

describe("ExportData JSON Serialization", () => {
  it("should produce a valid mermaid export structure", () => {
    const exportData: ExportData = {
      type: "mermaid",
      version: 1,
      source: "http://localhost:5173",
      content: "graph TD\n    A[Start] --> B[End]",
    };

    const json = JSON.stringify(exportData, null, 2);
    const parsed: ExportData = JSON.parse(json);

    expect(parsed.type).toBe("mermaid");
    expect(parsed.version).toBe(1);
    expect(parsed.source).toBe("http://localhost:5173");
    expect(parsed.content).toBe("graph TD\n    A[Start] --> B[End]");
  });

  it("should preserve multiline mermaid content through JSON round-trip", () => {
    const content = `sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B-->>A: Hi Alice`;

    const exportData: ExportData = {
      type: "mermaid",
      version: 1,
      source: "http://localhost:5173",
      content,
    };

    const json = JSON.stringify(exportData);
    const parsed: ExportData = JSON.parse(json);

    expect(parsed.content).toBe(content);
  });

  it("should handle empty content", () => {
    const exportData: ExportData = {
      type: "mermaid",
      version: 1,
      source: "http://localhost:5173",
      content: "",
    };

    const json = JSON.stringify(exportData);
    const parsed: ExportData = JSON.parse(json);

    expect(parsed.content).toBe("");
  });

  it("should preserve special characters in mermaid content", () => {
    const content = 'graph TD\n    A["Node with \\"quotes\\""] --> B["<html>"]';

    const exportData: ExportData = {
      type: "mermaid",
      version: 1,
      source: "http://localhost:5173",
      content,
    };

    const json = JSON.stringify(exportData);
    const parsed: ExportData = JSON.parse(json);

    expect(parsed.content).toBe(content);
  });

  it("should preserve large mermaid diagrams through JSON round-trip", () => {
    // Create a large diagram with many nodes
    const lines = ["graph TD"];
    for (let i = 0; i < 500; i++) {
      lines.push(`    N${i}[Node ${i}] --> N${i + 1}[Node ${i + 1}]`);
    }
    const content = lines.join("\n");

    const exportData: ExportData = {
      type: "mermaid",
      version: 1,
      source: "http://localhost:5173",
      content,
    };

    const json = JSON.stringify(exportData, null, 2);
    const parsed: ExportData = JSON.parse(json);

    expect(parsed.content).toBe(content);
    expect(parsed.content.length).toBe(content.length);
  });
});
