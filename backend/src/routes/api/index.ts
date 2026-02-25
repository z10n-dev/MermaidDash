import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { Server } from "socket.io";
import { PrismaClient } from "../../generated/client";
import { asyncHandler } from "../../middleware/errorHandler";
import { createDiagramRoutes } from "./diagrams";

export type ApiRoutesDeps = {
  prisma: PrismaClient;
  io: Server;
  requireAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};

const createApiKeyAuth = (prisma: PrismaClient) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }

    const key = authHeader.slice(7);
    if (!key) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }

    try {
      const apiKey = await prisma.apiKey.findUnique({
        where: { key },
        include: { user: true },
      });

      if (!apiKey || !apiKey.user.isActive) {
        res.status(401).json({ error: "Invalid API key" });
        return;
      }

      req.user = {
        id: apiKey.user.id,
        username: apiKey.user.username,
        email: apiKey.user.email,
        name: apiKey.user.name,
        role: apiKey.user.role,
        mustResetPassword: apiKey.user.mustResetPassword,
      };

      next();
    } catch (error) {
      console.error("API key auth error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  };
};

export const registerApiRoutes = ({ prisma, io, requireAuth }: ApiRoutesDeps) => {
  const router = Router();
  const apiKeyAuth = createApiKeyAuth(prisma);

  // API key management endpoints (require session auth)
  // POST /api/v1/keys - Create new API key
  router.post(
    "/keys",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const name = typeof req.body.name === "string" && req.body.name.trim().length > 0
        ? req.body.name.trim().slice(0, 100)
        : "Default";

      const key = `ek_${crypto.randomBytes(32).toString("hex")}`;

      const apiKey = await prisma.apiKey.create({
        data: {
          key,
          name,
          userId: req.user!.id,
        },
        select: {
          id: true,
          key: true,
          name: true,
          createdAt: true,
        },
      });

      res.status(201).json({
        id: apiKey.id,
        key: apiKey.key,
        name: apiKey.name,
        createdAt: apiKey.createdAt.toISOString(),
      });
    })
  );

  // GET /api/v1/keys - List API keys
  router.get(
    "/keys",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const keys = await prisma.apiKey.findMany({
        where: { userId: req.user!.id },
        select: {
          id: true,
          name: true,
          key: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        keys: keys.map((k) => ({
          id: k.id,
          name: k.name,
          // Only show prefix for security
          keyPreview: `${k.key.slice(0, 7)}...${k.key.slice(-4)}`,
          createdAt: k.createdAt.toISOString(),
        })),
      });
    })
  );

  // DELETE /api/v1/keys/:id - Delete API key
  router.delete(
    "/keys/:id",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const existing = await prisma.apiKey.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
        select: { id: true },
      });

      if (!existing) {
        res.status(404).json({ error: "API key not found" });
        return;
      }

      await prisma.apiKey.delete({ where: { id: req.params.id } });
      res.status(204).send();
    })
  );

  // Collection endpoints (require API key auth)
  router.get(
    "/collections",
    apiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const collections = await prisma.collection.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
      });
      // Filter out trash collections
      const filtered = collections.filter(
        (c) => c.name !== "Trash" && !c.id.startsWith("trash_")
      );
      res.json({
        collections: filtered.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt.toISOString(),
        })),
      });
    })
  );

  router.post(
    "/collections",
    apiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const name =
        typeof req.body.name === "string" && req.body.name.trim().length > 0
          ? req.body.name.trim().slice(0, 100)
          : null;
      if (!name) {
        res.status(400).json({ error: "Collection name is required" });
        return;
      }
      const collection = await prisma.collection.create({
        data: { name, userId: req.user!.id },
      });
      res.status(201).json({
        id: collection.id,
        name: collection.name,
        createdAt: collection.createdAt.toISOString(),
      });
    })
  );

  router.delete(
    "/collections/:id",
    apiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const existing = await prisma.collection.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      // Move diagrams out of collection before deleting
      await prisma.$transaction([
        prisma.drawing.updateMany({
          where: { collectionId: req.params.id, userId: req.user!.id },
          data: { collectionId: null },
        }),
        prisma.collection.deleteMany({
          where: { id: req.params.id, userId: req.user!.id },
        }),
      ]);
      res.status(204).send();
    })
  );

  // Diagram CRUD endpoints (require API key auth)
  const diagramRoutes = createDiagramRoutes({ prisma, io });
  router.use("/diagrams", apiKeyAuth, diagramRoutes);

  return router;
};
