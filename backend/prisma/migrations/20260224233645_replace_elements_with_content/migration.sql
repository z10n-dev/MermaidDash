/*
  Warnings:

  - You are about to drop the column `elements` on the `Drawing` table. All the data in the column will be lost.
  - You are about to drop the column `files` on the `Drawing` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Drawing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "appState" TEXT NOT NULL DEFAULT '{}',
    "preview" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Drawing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Drawing_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Drawing" ("appState", "collectionId", "createdAt", "id", "name", "preview", "updatedAt", "userId", "version") SELECT "appState", "collectionId", "createdAt", "id", "name", "preview", "updatedAt", "userId", "version" FROM "Drawing";
DROP TABLE "Drawing";
ALTER TABLE "new_Drawing" RENAME TO "Drawing";
CREATE INDEX "Drawing_userId_updatedAt_idx" ON "Drawing"("userId", "updatedAt");
CREATE INDEX "Drawing_userId_collectionId_updatedAt_idx" ON "Drawing"("userId", "collectionId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
