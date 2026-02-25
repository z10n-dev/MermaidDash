import archiver from "archiver";
import {
  RegisterImportExportDeps,
  assertSafeArchivePath,
  sanitizePathSegment,
  makeUniqueName,
} from "./shared";
import { getUserTrashCollectionId, isTrashCollectionId, toPublicTrashCollectionId } from "../dashboard/trash";

export const registerMermaidExportRoutes = (deps: RegisterImportExportDeps) => {
  const {
    app,
    prisma,
    requireAuth,
    asyncHandler,
    getBackendVersion,
  } = deps;

  /**
   * Export a single drawing as .mmd file
   */
  app.get("/export/mermaid/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const drawing = await prisma.drawing.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!drawing) return res.status(404).json({ error: "Drawing not found" });

    const safeName = sanitizePathSegment(drawing.name, "diagram");
    const filename = `${safeName}.mmd`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(drawing.content || "");
  }));

  /**
   * Bulk export all drawings as a ZIP of .mmd files + manifest.json
   */
  app.get("/export/mermaid", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const trashCollectionId = getUserTrashCollectionId(req.user.id);
    const drawings = await prisma.drawing.findMany({
      where: { userId: req.user.id },
      include: { collection: true },
    });

    const date = new Date().toISOString().split("T")[0];
    const exportedAt = new Date().toISOString();
    const filename = `mermaiddash-backup-${date}.zip`;

    // Build file paths for each drawing
    const usedNames = new Set<string>();
    const drawingsManifest = drawings.map((drawing) => {
      const baseName = sanitizePathSegment(drawing.name, "diagram");
      const uniqueName = makeUniqueName(baseName, usedNames);
      const filePath = `${uniqueName}.mmd`;

      return {
        id: drawing.id,
        name: drawing.name,
        filePath,
        collectionId: toPublicTrashCollectionId(drawing.collectionId, req.user!.id),
        collectionName: drawing.collection
          ? (isTrashCollectionId(drawing.collection.id, req.user!.id) ? "Trash" : drawing.collection.name)
          : null,
        version: drawing.version,
        createdAt: drawing.createdAt.toISOString(),
        updatedAt: drawing.updatedAt.toISOString(),
      };
    });

    const manifest = {
      format: "mermaid" as const,
      formatVersion: 1 as const,
      exportedAt,
      backendVersion: getBackendVersion(),
      userId: req.user.id,
      drawings: drawingsManifest,
    };

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const abortArchive = () => {
      try {
        archive.abort();
      } catch {
      }
    };

    res.on("close", () => {
      if (res.writableEnded) return;
      abortArchive();
    });

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      abortArchive();
      if (res.headersSent) {
        res.destroy(err instanceof Error ? err : undefined);
        return;
      }
      res.status(500).json({ error: "Failed to create archive" });
    });
    archive.pipe(res);

    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

    for (const drawing of drawings) {
      const meta = drawingsManifest.find((d) => d.id === drawing.id);
      if (!meta) continue;
      assertSafeArchivePath(meta.filePath);
      archive.append(drawing.content || "", { name: meta.filePath });
    }

    await archive.finalize();
  }));
};
