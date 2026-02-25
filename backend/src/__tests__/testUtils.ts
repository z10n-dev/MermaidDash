/**
 * Test utilities for backend integration tests
 */
import { PrismaClient } from "../generated/client";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const TEST_DB_FILENAME = `test.${process.pid}.${Math.random().toString(16).slice(2)}.db`;
const TEST_DB_PATH = path.resolve(__dirname, "../../prisma", TEST_DB_FILENAME);
const DB_PUSH_LOCK_PATH = path.resolve(__dirname, "../../prisma/.test-db-push.lock");

const sleepSync = (ms: number) => {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(shared, 0, 0, ms);
};

const withDbPushLock = (fn: () => void) => {
  const start = Date.now();
  let fd: number | null = null;
  while (fd === null) {
    try {
      fd = fs.openSync(DB_PUSH_LOCK_PATH, "wx");
      fs.writeFileSync(fd, String(process.pid));
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw error;
      if (Date.now() - start > 30_000) {
        throw new Error("Timed out waiting for Prisma db push lock");
      }
      sleepSync(50);
    }
  }

  try {
    fn();
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
    }
    try {
      fs.unlinkSync(DB_PUSH_LOCK_PATH);
    } catch {
    }
  }
};

/**
 * Get a test Prisma client pointing to the test database
 */
export const getTestPrisma = () => {
  const databaseUrl = `file:${TEST_DB_PATH}`;
  process.env.DATABASE_URL = databaseUrl;
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
};

/**
 * Setup the test database by running migrations
 */
export const setupTestDb = () => {
  const databaseUrl = `file:${TEST_DB_PATH}`;
  process.env.DATABASE_URL = databaseUrl;
  
  try {
    withDbPushLock(() => {
      execSync("npx prisma db push --skip-generate --force-reset", {
        cwd: path.resolve(__dirname, "../../"),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          RUST_LOG: "info",
        },
        stdio: "pipe",
      });
    });
  } catch (error) {
    console.error("Failed to setup test database:", error);
    throw error;
  }
};

/**
 * Clean up the test database between tests
 */
export const cleanupTestDb = async (prisma: PrismaClient) => {
  await prisma.drawing.deleteMany({});
  await prisma.collection.deleteMany({});
};

/**
 * Create a test user for testing
 */
export const createTestUser = async (prisma: PrismaClient, email: string = "test@example.com") => {
  const bcrypt = require("bcrypt");
  const passwordHash = await bcrypt.hash("testpassword", 10);
  
  return await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: "Test User",
    },
  });
};

/**
 * Initialize test database with required data
 */
export const initTestDb = async (prisma: PrismaClient) => {
  const testUser = await createTestUser(prisma);
  const trashCollectionId = `trash:${testUser.id}`;
  
  const trash = await prisma.collection.findFirst({
    where: { id: trashCollectionId, userId: testUser.id },
  });
  if (!trash) {
    await prisma.collection.create({
      data: { id: trashCollectionId, name: "Trash", userId: testUser.id },
    });
  }
  
  return testUser;
};

