-- CreateTable
CREATE TABLE "UserAiSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "apiKey" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserAiSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAiSettings_userId_key" ON "UserAiSettings"("userId");
