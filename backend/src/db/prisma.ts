import { PrismaClient } from "../generated/client";

declare global {
  // eslint-disable-next-line no-var
  var __mermaiddashPrisma: PrismaClient | undefined;
}

const prismaClient = globalThis.__mermaiddashPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__mermaiddashPrisma = prismaClient;
}

export { prismaClient as prisma };
