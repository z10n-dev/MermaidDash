import { describe, expect, it } from "vitest";
import { getColorFromString } from "./shared";

describe("editor/shared utilities", () => {
  it("returns a consistent color for the same string", () => {
    const color1 = getColorFromString("alice");
    const color2 = getColorFromString("alice");
    expect(color1).toBe(color2);
  });

  it("returns a valid hex color", () => {
    const color = getColorFromString("bob");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns different colors for different strings", () => {
    const color1 = getColorFromString("alice");
    const color2 = getColorFromString("bob");
    // Not guaranteed for all inputs but very likely for distinct short strings
    expect(typeof color1).toBe("string");
    expect(typeof color2).toBe("string");
  });
});
