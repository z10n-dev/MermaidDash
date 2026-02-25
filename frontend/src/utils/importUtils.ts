import { api } from "../api";
import { type UploadStatus } from "../context/UploadContext";

/**
 * Extract mermaid content from a .mermaid.json file (frontend export format).
 * Expected shape: { type: "mermaid", content: "...", version?: number }
 */
const parseMermaidJson = (text: string): string | null => {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === "mermaid" && typeof parsed?.content === "string") {
      return parsed.content;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Get a clean display name from a filename by removing known extensions.
 */
const nameFromFilename = (filename: string): string => {
  return filename
    .replace(/\.mermaid\.json$/, "")
    .replace(/\.mmd$/, "")
    || "Imported Diagram";
};

/**
 * Import mermaid files.
 * Supports:
 * - .mmd files (plain text mermaid syntax)
 * - .mermaid.json files (frontend export format with { type, content, version })
 * - .zip files (archives containing .mmd files)
 */
export const importDrawings = async (
  files: File[],
  targetCollectionId: string | null,
  onSuccess?: () => void | Promise<void>,
  onProgress?: (
    fileIndex: number,
    status: UploadStatus,
    progress: number,
    error?: string
  ) => void
) => {
  const supportedFiles = files.filter(
    (f) =>
      f.name.endsWith(".mmd") ||
      f.name.endsWith(".mermaid.json") ||
      f.name.endsWith(".zip")
  );

  if (supportedFiles.length === 0) {
    return { success: 0, failed: 0, errors: ["No supported files found. Expected .mmd, .mermaid.json, or .zip files."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  const originalIndexMap = new Map<number, number>();
  supportedFiles.forEach((sf, i) => {
    const originalIndex = files.indexOf(sf);
    originalIndexMap.set(i, originalIndex);
  });

  for (let i = 0; i < supportedFiles.length; i++) {
    const file = supportedFiles[i];
    const fileIndex = originalIndexMap.get(i) ?? i;

    try {
      if (onProgress) onProgress(fileIndex, "processing", 0);

      if (file.name.endsWith(".zip")) {
        // Upload ZIP to backend for server-side extraction
        const formData = new FormData();
        formData.append("file", file);
        if (targetCollectionId) {
          formData.append("collectionId", targetCollectionId);
        }

        if (onProgress) onProgress(fileIndex, "uploading", 0);
        const response = await api.post<{
          success: boolean;
          drawings: { created: number; updated: number };
          importedIds?: string[];
        }>("/import/mermaid", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress(fileIndex, "uploading", pct);
            }
          },
        });

        const result = response.data;
        successCount += result.drawings.created + result.drawings.updated;
        if (onProgress) onProgress(fileIndex, "success", 100);
        continue;
      }

      // .mmd or .mermaid.json — parse locally and create via API
      const text = await file.text();
      let content: string;

      if (file.name.endsWith(".mermaid.json")) {
        const extracted = parseMermaidJson(text);
        if (!extracted) {
          throw new Error("Invalid .mermaid.json file: expected { type: \"mermaid\", content: \"...\" }");
        }
        content = extracted;
      } else {
        // .mmd file — content is the raw text
        content = text;
      }

      if (!content.trim()) {
        throw new Error("File contains no mermaid content");
      }

      const name = nameFromFilename(file.name);

      if (onProgress) onProgress(fileIndex, "uploading", 0);

      await api.post("/drawings", {
        name,
        content: content.trim(),
        collectionId: targetCollectionId,
      }, {
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(fileIndex, "uploading", pct);
          }
        },
      });

      if (onProgress) onProgress(fileIndex, "success", 100);
      successCount++;
    } catch (err: any) {
      console.error(`Failed to import ${file.name}:`, err);
      failCount++;
      const errorMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Import failed";
      errors.push(`${file.name}: ${errorMessage}`);
      if (onProgress) onProgress(fileIndex, "error", 0, errorMessage);
    }
  }

  if (successCount > 0 && onSuccess) {
    await onSuccess();
  }

  return { success: successCount, failed: failCount, errors };
};

/**
 * Legacy import — now delegates to the same mermaid import logic.
 * Kept for backwards compatibility with any UI that still calls it.
 */
export const importLegacyFiles = importDrawings;
