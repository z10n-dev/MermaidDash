import { promises as fsPromises } from "fs";
import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import {
  RegisterImportExportDeps,
  ImportValidationError,
  assertSafeZipArchive,
  mermaidManifestSchemaV1,
  findFirstDuplicate,
  getSafeZipEntry,
  isMermaidContent,
  resolveSafeUploadedFilePath,
} from "./shared";
import { getUserTrashCollectionId } from "../dashboard/trash";

export const registerMermaidImportRoutes = (deps: RegisterImportExportDeps) => {
  const {
    app,
    prisma,
    requireAuth,
    asyncHandler,
    upload,
    uploadDir,
    sanitizeText,
    ensureTrashCollection,
    invalidateDrawingsCache,
    removeFileIfExists,
    MAX_IMPORT_ARCHIVE_ENTRIES,
    MAX_IMPORT_DRAWINGS,
    MAX_IMPORT_MANIFEST_BYTES,
    MAX_IMPORT_DRAWING_BYTES,
    MAX_IMPORT_TOTAL_EXTRACTED_BYTES,
  } = deps;

  /**
   * Import a single .mmd file or a ZIP archive containing .mmd files.
   */
  app.post("/import/mermaid", requireAuth, upload.single("file"), asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let stagedPath: string;
    try {
      stagedPath = await resolveSafeUploadedFilePath({ filename: req.file.filename }, uploadDir);
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return res.status(error.status).json({ error: "Invalid upload", message: error.message });
      }
      throw error;
    }

    const targetCollectionId = typeof req.body?.collectionId === "string" && req.body.collectionId.trim()
      ? req.body.collectionId.trim()
      : null;

    try {
      const buffer = await fsPromises.readFile(stagedPath);
      const originalName = typeof req.file.originalname === "string" ? req.file.originalname : "upload";

      // Detect file type by original name or content
      if (originalName.endsWith(".mmd")) {
        // Single .mmd file
        const content = buffer.toString("utf-8");
        if (Buffer.byteLength(content, "utf8") > MAX_IMPORT_DRAWING_BYTES) {
          return res.status(400).json({ error: "File too large" });
        }
        if (!isMermaidContent(content)) {
          return res.status(400).json({ error: "Invalid mermaid file", message: "File is empty or not valid mermaid content" });
        }

        const name = sanitizeText(originalName.replace(/\.mmd$/, ""), 255) || "Imported Diagram";
        const drawing = await prisma.drawing.create({
          data: {
            name,
            content: content.trim(),
            userId: req.user.id,
            collectionId: targetCollectionId,
          },
        });
        invalidateDrawingsCache();

        return res.json({
          success: true,
          message: "Mermaid diagram imported",
          drawings: { created: 1, updated: 0 },
          importedIds: [drawing.id],
        });
      }

      if (originalName.endsWith(".mermaid.json")) {
        // .mermaid.json file (frontend export format)
        const raw = buffer.toString("utf-8");
        if (Buffer.byteLength(raw, "utf8") > MAX_IMPORT_DRAWING_BYTES) {
          return res.status(400).json({ error: "File too large" });
        }

        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return res.status(400).json({ error: "Invalid JSON file" });
        }

        if (parsed?.type !== "mermaid" || typeof parsed?.content !== "string") {
          return res.status(400).json({
            error: "Invalid mermaid.json file",
            message: "Expected { type: \"mermaid\", content: \"...\" }",
          });
        }

        const content = parsed.content as string;
        if (!isMermaidContent(content)) {
          return res.status(400).json({ error: "Invalid mermaid content", message: "Content is empty" });
        }

        const name = sanitizeText(originalName.replace(/\.mermaid\.json$/, ""), 255) || "Imported Diagram";
        const drawing = await prisma.drawing.create({
          data: {
            name,
            content: content.trim(),
            userId: req.user.id,
            collectionId: targetCollectionId,
          },
        });
        invalidateDrawingsCache();

        return res.json({
          success: true,
          message: "Mermaid diagram imported",
          drawings: { created: 1, updated: 0 },
          importedIds: [drawing.id],
        });
      }

      // Assume ZIP archive
      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(buffer);
      } catch {
        return res.status(400).json({
          error: "Unsupported file format",
          message: "Expected .mmd, .mermaid.json, or .zip file",
        });
      }

      try {
        assertSafeZipArchive(zip, MAX_IMPORT_ARCHIVE_ENTRIES);
      } catch (error) {
        if (error instanceof ImportValidationError) {
          return res.status(error.status).json({ error: "Invalid archive", message: error.message });
        }
        throw error;
      }

      // Check for manifest.json (bulk export format)
      const manifestEntry = getSafeZipEntry(zip, "manifest.json");
      if (manifestEntry) {
        return await importZipWithManifest(
          zip, manifestEntry, req, res, targetCollectionId
        );
      }

      // No manifest — just extract all .mmd files
      return await importZipWithoutManifest(zip, req, res, targetCollectionId);

    } finally {
      await removeFileIfExists(stagedPath);
    }
  }));

  /**
   * Import a ZIP with manifest.json (bulk export format)
   */
  const importZipWithManifest = async (
    zip: JSZip,
    manifestEntry: JSZip.JSZipObject,
    req: any,
    res: any,
    targetCollectionId: string | null
  ) => {
    const rawManifest = await manifestEntry.async("string");
    if (Buffer.byteLength(rawManifest, "utf8") > MAX_IMPORT_MANIFEST_BYTES) {
      return res.status(400).json({ error: "Manifest too large" });
    }

    let manifestJson: unknown;
    try {
      manifestJson = JSON.parse(rawManifest);
    } catch {
      return res.status(400).json({ error: "Invalid manifest JSON" });
    }

    const parsed = mermaidManifestSchemaV1.safeParse(manifestJson);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid manifest",
        message: "Malformed manifest.json",
      });
    }
    const manifest = parsed.data;

    if (manifest.drawings.length > MAX_IMPORT_DRAWINGS) {
      return res.status(400).json({
        error: "Too many drawings",
        message: `Maximum ${MAX_IMPORT_DRAWINGS} drawings per import`,
      });
    }

    const duplicateId = findFirstDuplicate(manifest.drawings.map((d) => d.id));
    if (duplicateId) {
      return res.status(400).json({
        error: "Invalid manifest",
        message: `Duplicate drawing id: ${duplicateId}`,
      });
    }

    const duplicatePath = findFirstDuplicate(manifest.drawings.map((d) => d.filePath));
    if (duplicatePath) {
      return res.status(400).json({
        error: "Invalid manifest",
        message: `Duplicate file path: ${duplicatePath}`,
      });
    }

    // Extract and validate all drawings
    type PreparedDrawing = { id: string; name: string; content: string; collectionId: string | null; version?: number };
    const prepared: PreparedDrawing[] = [];
    let extractedBytes = Buffer.byteLength(rawManifest, "utf8");

    try {
      for (const d of manifest.drawings) {
        const entry = getSafeZipEntry(zip, d.filePath);
        if (!entry) throw new ImportValidationError(`Missing file: ${d.filePath}`);

        const raw = await entry.async("string");
        const rawSize = Buffer.byteLength(raw, "utf8");
        if (rawSize > MAX_IMPORT_DRAWING_BYTES) {
          throw new ImportValidationError(`File too large: ${d.filePath}`);
        }
        extractedBytes += rawSize;
        if (extractedBytes > MAX_IMPORT_TOTAL_EXTRACTED_BYTES) {
          throw new ImportValidationError("Archive contents exceed maximum import size");
        }

        if (!isMermaidContent(raw)) {
          throw new ImportValidationError(`Empty or invalid mermaid content: ${d.filePath}`);
        }

        prepared.push({
          id: d.id,
          name: sanitizeText(d.name, 255) || "Imported Diagram",
          content: raw.trim(),
          collectionId: targetCollectionId ?? d.collectionId,
          version: typeof d.version === "number" ? d.version : undefined,
        });
      }
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return res.status(error.status).json({ error: "Invalid archive", message: error.message });
      }
      throw error;
    }

    // Upsert drawings in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const trashCollectionId = getUserTrashCollectionId(req.user!.id);
      let created = 0;
      let updated = 0;
      const importedIds: string[] = [];

      const needsTrash = prepared.some((d) => d.collectionId === "trash");
      if (needsTrash) await ensureTrashCollection(tx, req.user!.id);

      for (const p of prepared) {
        const resolvedCollectionId =
          p.collectionId === "trash" ? trashCollectionId : p.collectionId;

        const existing = await tx.drawing.findUnique({ where: { id: p.id } });
        if (!existing) {
          const newDrawing = await tx.drawing.create({
            data: {
              id: p.id,
              name: p.name,
              content: p.content,

              version: p.version ?? 1,
              userId: req.user!.id,
              collectionId: resolvedCollectionId,
            },
          });
          importedIds.push(newDrawing.id);
          created += 1;
        } else if (existing.userId === req.user!.id) {
          await tx.drawing.update({
            where: { id: p.id },
            data: {
              name: p.name,
              content: p.content,
              version: p.version ?? existing.version,
              collectionId: resolvedCollectionId,
            },
          });
          importedIds.push(p.id);
          updated += 1;
        } else {
          // ID conflict with another user — create with new ID
          const newId = uuidv4();
          await tx.drawing.create({
            data: {
              id: newId,
              name: p.name,
              content: p.content,

              version: p.version ?? 1,
              userId: req.user!.id,
              collectionId: resolvedCollectionId,
            },
          });
          importedIds.push(newId);
          created += 1;
        }
      }

      return { created, updated, importedIds };
    });

    invalidateDrawingsCache();
    return res.json({
      success: true,
      message: "Mermaid diagrams imported from archive",
      drawings: { created: result.created, updated: result.updated },
      importedIds: result.importedIds,
    });
  };

  /**
   * Import a ZIP without manifest — just extract all .mmd files
   */
  const importZipWithoutManifest = async (
    zip: JSZip,
    req: any,
    res: any,
    targetCollectionId: string | null
  ) => {
    const entries = Object.values(zip.files).filter(
      (e) => !e.dir && e.name.endsWith(".mmd")
    );

    if (entries.length === 0) {
      return res.status(400).json({
        error: "No mermaid files found",
        message: "ZIP archive contains no .mmd files",
      });
    }

    if (entries.length > MAX_IMPORT_DRAWINGS) {
      return res.status(400).json({
        error: "Too many files",
        message: `Maximum ${MAX_IMPORT_DRAWINGS} diagrams per import`,
      });
    }

    const importedIds: string[] = [];
    let extractedBytes = 0;

    for (const entry of entries) {
      const raw = await entry.async("string");
      const rawSize = Buffer.byteLength(raw, "utf8");
      if (rawSize > MAX_IMPORT_DRAWING_BYTES) {
        return res.status(400).json({ error: "File too large", message: `${entry.name} exceeds size limit` });
      }
      extractedBytes += rawSize;
      if (extractedBytes > MAX_IMPORT_TOTAL_EXTRACTED_BYTES) {
        return res.status(400).json({ error: "Archive too large", message: "Total extracted content exceeds limit" });
      }

      if (!isMermaidContent(raw)) continue;

      const baseName = entry.name.replace(/\.mmd$/, "").split("/").pop() || "Imported Diagram";
      const name = sanitizeText(baseName, 255) || "Imported Diagram";

      const drawing = await prisma.drawing.create({
        data: {
          name,
          content: raw.trim(),

          userId: req.user!.id,
          collectionId: targetCollectionId,
        },
      });
      importedIds.push(drawing.id);
    }

    invalidateDrawingsCache();
    return res.json({
      success: true,
      message: `Imported ${importedIds.length} mermaid diagram(s)`,
      drawings: { created: importedIds.length, updated: 0 },
      importedIds,
    });
  };
};
