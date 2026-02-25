import express from "express";
import path from "path";
import { promises as fsPromises } from "fs";
import JSZip from "jszip";
import { z } from "zod";
import { Prisma, PrismaClient } from "../../generated/client";

export class ImportValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ImportValidationError";
    this.status = status;
  }
}

export const mermaidManifestSchemaV1 = z.object({
  format: z.literal("mermaid"),
  formatVersion: z.literal(1),
  exportedAt: z.string().min(1),
  backendVersion: z.string().optional(),
  userId: z.string().optional(),
  drawings: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      filePath: z.string().min(1),
      collectionId: z.string().nullable(),
      collectionName: z.string().nullable().optional(),
      version: z.number().int().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
    })
  ),
});

export type RegisterImportExportDeps = {
  app: express.Router;
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<T>
  ) => express.RequestHandler;
  upload: any;
  uploadDir: string;
  backendRoot: string;
  getBackendVersion: () => string;
  parseJsonField: <T>(rawValue: string | null | undefined, fallback: T) => T;
  sanitizeText: (input: unknown, maxLength?: number) => string;
  ensureTrashCollection: (
    db: Prisma.TransactionClient | PrismaClient,
    userId: string
  ) => Promise<void>;
  invalidateDrawingsCache: () => void;
  removeFileIfExists: (filePath?: string) => Promise<void>;
  MAX_IMPORT_ARCHIVE_ENTRIES: number;
  MAX_IMPORT_COLLECTIONS: number;
  MAX_IMPORT_DRAWINGS: number;
  MAX_IMPORT_MANIFEST_BYTES: number;
  MAX_IMPORT_DRAWING_BYTES: number;
  MAX_IMPORT_TOTAL_EXTRACTED_BYTES: number;
};

const getZipEntries = (zip: JSZip) => Object.values(zip.files).filter((entry) => !entry.dir);

export const normalizeArchivePath = (filePath: string): string =>
  path.posix.normalize(filePath.replace(/\\/g, "/"));

export const assertSafeArchivePath = (filePath: string) => {
  const normalized = normalizeArchivePath(filePath);
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("\0")
  ) {
    throw new ImportValidationError(`Unsafe archive path: ${filePath}`);
  }
};

export const assertSafeZipArchive = (zip: JSZip, maxEntries: number) => {
  const entries = getZipEntries(zip);
  if (entries.length > maxEntries) {
    throw new ImportValidationError("Archive contains too many files");
  }
  for (const entry of entries) {
    assertSafeArchivePath(entry.name);
  }
};

export const getSafeZipEntry = (zip: JSZip, filePath: string) => {
  const normalizedPath = normalizeArchivePath(filePath);
  assertSafeArchivePath(normalizedPath);
  return zip.file(normalizedPath);
};

export const sanitizePathSegment = (input: string, fallback: string): string => {
  const value = typeof input === "string" ? input.trim() : "";
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  const withoutLeadingDots = cleaned.replace(/^\.+/, "").trim();
  if (withoutLeadingDots.length === 0) return fallback;
  if (withoutLeadingDots === "." || withoutLeadingDots === "..") return fallback;
  return withoutLeadingDots;
};

export const makeUniqueName = (base: string, used: Set<string>): string => {
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}__${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
};

export const findFirstDuplicate = (values: string[]): string | null => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
};

const isPathInsideDirectory = (candidatePath: string, rootDir: string): boolean => {
  const relativePath = path.relative(rootDir, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
};

const isSafeMulterTempFilename = (value: string): boolean =>
  /^[a-f0-9]{32}$/.test(value);

export const resolveSafeUploadedFilePath = async (
  fileMeta: { filename?: unknown },
  uploadRoot: string
): Promise<string> => {
  const absoluteUploadRoot = path.resolve(uploadRoot);
  let canonicalUploadRoot = absoluteUploadRoot;

  try {
    canonicalUploadRoot = await fsPromises.realpath(absoluteUploadRoot);
  } catch {
    throw new ImportValidationError("Invalid upload path");
  }

  const filename = typeof fileMeta.filename === "string" ? fileMeta.filename : "";
  if (!isSafeMulterTempFilename(filename)) {
    throw new ImportValidationError("Invalid upload path");
  }

  const joinedPath = path.resolve(canonicalUploadRoot, filename);
  if (!isPathInsideDirectory(joinedPath, canonicalUploadRoot)) {
    throw new ImportValidationError("Invalid upload path");
  }

  return joinedPath;
};

/**
 * Validate that a string looks like mermaid content (non-empty text).
 * We intentionally keep this simple — mermaid rendering will catch syntax errors.
 */
export const isMermaidContent = (content: string): boolean => {
  return typeof content === "string" && content.trim().length > 0;
};


