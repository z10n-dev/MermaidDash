import type { Drawing } from "../types";

export interface ExportData {
  type: "mermaid";
  version: 1;
  source: string;
  content: string;
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Export a drawing to a .mermaid JSON file and trigger download
 */
export const exportDrawingToFile = (
  drawing: Drawing,
  filename?: string
): void => {
  const exportData: ExportData = {
    type: "mermaid",
    version: 1,
    source: window.location.origin,
    content: drawing.content || "",
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, filename || `${drawing.name}.mermaid.json`);
};

/**
 * Export drawing from Editor with current mermaid content
 */
export const exportFromEditor = (
  name: string,
  content: string
): void => {
  const exportData: ExportData = {
    type: "mermaid",
    version: 1,
    source: window.location.origin,
    content: content || "",
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${name}.mermaid.json`);
};

/**
 * Export an SVG string as a .svg file download.
 */
export const exportAsSvg = (svgContent: string, filename: string): void => {
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
};

/**
 * Parse SVG dimensions from viewBox or width/height attributes.
 */
const parseSvgDimensions = (svgContent: string): { w: number; h: number } => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return { w: 800, h: 600 };

  let w = 0,
    h = 0;
  const viewBox = svgEl.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    w = parts[2] || 0;
    h = parts[3] || 0;
  }
  if (!w) w = parseFloat(svgEl.getAttribute("width") || "800");
  if (!h) h = parseFloat(svgEl.getAttribute("height") || "600");
  return { w, h };
};

/** Give up rasterizing an SVG after this long so callers never hang. */
const SVG_RASTERIZE_TIMEOUT_MS = 10_000;

/**
 * Render an SVG string to a canvas and return the canvas.
 */
const svgToCanvas = (
  svgContent: string,
  scale: number,
  background: string | null = "#ffffff"
): Promise<HTMLCanvasElement | null> => {
  const { w, h } = parseSvgDimensions(svgContent);
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const svgData = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;

  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(null);
    }, SVG_RASTERIZE_TIMEOUT_MS);

    img.onload = () => {
      clearTimeout(timer);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = svgData;
  });
};

/**
 * Render an SVG string to a PNG and trigger download.
 * Uses 2x scale for retina-quality output.
 */
export const exportAsPng = async (
  svgContent: string,
  filename: string,
  scale = 2
): Promise<void> => {
  const canvas = await svgToCanvas(svgContent, scale);
  if (!canvas) return;

  return new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename);
      resolve();
    }, "image/png");
  });
};

/**
 * Render an SVG string to a PNG data URL for use as a preview thumbnail.
 * Returns a data:image/png;base64,... string, or null if rendering fails.
 */
export const svgToPngDataUrl = async (
  svgContent: string,
  maxSize = 400
): Promise<string | null> => {
  const { w, h } = parseSvgDimensions(svgContent);
  // Scale down to fit within maxSize while preserving aspect ratio
  const scale = Math.min(maxSize / w, maxSize / h, 2);
  const canvas = await svgToCanvas(svgContent, scale, null);
  if (!canvas) return null;
  return canvas.toDataURL("image/png");
};
