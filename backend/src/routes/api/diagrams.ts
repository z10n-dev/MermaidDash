import { Router, Request, Response } from "express";
import { z } from "zod";
import { Server } from "socket.io";
import { PrismaClient } from "../../generated/client";
import { asyncHandler } from "../../middleware/errorHandler";

const createDiagramSchema = z.object({
  name: z.string().trim().min(1).max(255),
  content: z.string().default("graph TD\n    A[Start]"),
  collectionId: z.string().trim().min(1).nullish(),
});

const updateDiagramSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  content: z.string().optional(),
  preview: z.string().nullish(),
  collectionId: z.string().trim().min(1).nullish(),
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const formatDiagram = (drawing: {
  id: string;
  name: string;
  content: string;
  preview: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: drawing.id,
  name: drawing.name,
  content: drawing.content,
  preview: drawing.preview,
  createdAt: drawing.createdAt.toISOString(),
  updatedAt: drawing.updatedAt.toISOString(),
});

export type DiagramRoutesDeps = {
  prisma: PrismaClient;
  io: Server;
};

export const createDiagramRoutes = ({ prisma, io }: DiagramRoutesDeps): Router => {
  const router = Router();

  // POST /api/v1/diagrams - Create diagram
  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = createDiagramSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation error",
          details: parsed.error.issues,
        });
        return;
      }

      const { name, content, collectionId } = parsed.data;
      const userId = req.user!.id;

      const drawing = await prisma.drawing.create({
        data: {
          name,
          content,
          collectionId: collectionId ?? null,
          userId,
        },
        select: {
          id: true,
          name: true,
          content: true,
          preview: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      io.emit("diagrams-changed", { action: "created", diagramId: drawing.id });

      res.status(201).json(formatDiagram(drawing));
    })
  );

  // GET /api/v1/diagrams - List diagrams
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation error",
          details: parsed.error.issues,
        });
        return;
      }

      const { search, page, limit } = parsed.data;
      const userId = req.user!.id;
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { userId };
      if (search) {
        where.name = { contains: search };
      }

      const [drawings, total] = await Promise.all([
        prisma.drawing.findMany({
          where,
          select: {
            id: true,
            name: true,
            content: true,
            preview: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.drawing.count({ where }),
      ]);

      res.json({
        diagrams: drawings.map(formatDiagram),
        total,
        page,
        limit,
      });
    })
  );

  // GET /api/v1/diagrams/:id - Get diagram
  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user!.id;
      const drawing = await prisma.drawing.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          name: true,
          content: true,
          preview: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!drawing) {
        res.status(404).json({ error: "Diagram not found" });
        return;
      }

      res.json(formatDiagram(drawing));
    })
  );

  // PUT /api/v1/diagrams/:id - Update diagram
  router.put(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = updateDiagramSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation error",
          details: parsed.error.issues,
        });
        return;
      }

      const userId = req.user!.id;
      const drawingId = req.params.id;

      const existing = await prisma.drawing.findFirst({
        where: { id: drawingId, userId },
        select: { id: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Diagram not found" });
        return;
      }

      const updateData: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
      if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
      if (parsed.data.preview !== undefined) updateData.preview = parsed.data.preview ?? null;
      if (parsed.data.collectionId !== undefined) updateData.collectionId = parsed.data.collectionId ?? null;

      const drawing = await prisma.drawing.update({
        where: { id: drawingId },
        data: {
          ...updateData,
          version: { increment: 1 },
        },
        select: {
          id: true,
          name: true,
          content: true,
          preview: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      io.emit("diagrams-changed", { action: "updated", diagramId: drawingId });

      // Broadcast content-update to any open editors via WebSocket
      if (parsed.data.content !== undefined) {
        io.to(`drawing_${drawingId}`).emit("content-update", {
          drawingId,
          content: parsed.data.content,
        });
      }

      res.json(formatDiagram(drawing));
    })
  );

  // DELETE /api/v1/diagrams/:id - Delete diagram
  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user!.id;
      const drawingId = req.params.id;

      const existing = await prisma.drawing.findFirst({
        where: { id: drawingId, userId },
        select: { id: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Diagram not found" });
        return;
      }

      await prisma.drawing.delete({ where: { id: drawingId } });

      io.emit("diagrams-changed", { action: "deleted", diagramId: drawingId });

      res.status(204).send();
    })
  );

  return router;
};
