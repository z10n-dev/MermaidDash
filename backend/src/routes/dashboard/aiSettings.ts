import express from "express";
import { z } from "zod";
import { encrypt, decrypt } from "../../utils/encryption";
import type { DashboardRouteDeps } from "./types";

const aiSettingsUpdateSchema = z.object({
  provider: z.enum(["openai"]).default("openai"),
  apiKey: z.string().min(1).max(500),
  model: z.string().min(1).max(100).default("gpt-5-mini"),
});

export const registerAiSettingsRoutes = (
  app: express.Router,
  deps: DashboardRouteDeps
) => {
  const { prisma, requireAuth, asyncHandler } = deps;

  app.get(
    "/ai-settings",
    requireAuth,
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const userId = req.user!.id;
      const settings = await prisma.userAiSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        res.json({ configured: false });
        return;
      }

      res.json({
        configured: true,
        provider: settings.provider,
        model: settings.model,
      });
    })
  );

  app.get(
    "/ai-settings/key",
    requireAuth,
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const userId = req.user!.id;
      const settings = await prisma.userAiSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        res.status(404).json({ error: "AI not configured" });
        return;
      }

      const apiKey = decrypt(settings.apiKey);
      res.json({
        provider: settings.provider,
        model: settings.model,
        apiKey,
      });
    })
  );

  app.put(
    "/ai-settings",
    requireAuth,
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const userId = req.user!.id;
      const parsed = aiSettingsUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid AI settings",
          details: parsed.error.issues,
        });
        return;
      }

      const { provider, apiKey, model } = parsed.data;

      let encryptedKey: string;
      try {
        encryptedKey = encrypt(apiKey);
      } catch {
        res.status(503).json({
          error: "Server is not configured for AI key storage. The administrator must set the AI_ENCRYPTION_KEY environment variable.",
        });
        return;
      }

      await prisma.userAiSettings.upsert({
        where: { userId },
        update: { provider, apiKey: encryptedKey, model },
        create: { userId, provider, apiKey: encryptedKey, model },
      });

      res.json({ configured: true, provider, model });
    })
  );

  app.delete(
    "/ai-settings",
    requireAuth,
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const userId = req.user!.id;
      await prisma.userAiSettings
        .delete({ where: { userId } })
        .catch(() => {});
      res.json({ configured: false });
    })
  );
};
