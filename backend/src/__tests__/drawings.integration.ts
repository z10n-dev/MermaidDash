import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  getTestPrisma,
  cleanupTestDb,
  initTestDb,
  setupTestDb,
} from "./testUtils";

describe("Drawing API - Database Round-Trip", () => {
  const prisma = getTestPrisma();
  let testUser: { id: string };

  beforeAll(async () => {
    setupTestDb();
    testUser = await initTestDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupTestDb(prisma);
  });

  it("should preserve content through create and read cycle", async () => {
    const content = "graph TD\n    A[Start] --> B[End]\n    B --> C[Done]";
    const created = await prisma.drawing.create({
      data: {
        name: "Test with Content",
        content,
        userId: testUser.id,
      },
    });
    const retrieved = await prisma.drawing.findUnique({
      where: { id: created.id },
    });
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe(content);
  });

  it("should preserve content through update cycle", async () => {
    const created = await prisma.drawing.create({
      data: {
        name: "Update Test",
        content: "graph TD\n    A[Start]",
        userId: testUser.id,
      },
    });
    const updatedContent = "graph LR\n    X[Begin] --> Y[Middle] --> Z[End]";
    await prisma.drawing.update({
      where: { id: created.id },
      data: { content: updatedContent },
    });
    const retrieved = await prisma.drawing.findUnique({
      where: { id: created.id },
    });
    expect(retrieved!.content).toBe(updatedContent);
  });
});
