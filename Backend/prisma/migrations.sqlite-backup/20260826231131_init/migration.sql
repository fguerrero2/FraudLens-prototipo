-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "deviceId" TEXT,
    "riskScore" REAL,
    "riskLevel" TEXT,
    "decision" TEXT NOT NULL,
    "analyzedByModel" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "ruleApplied" TEXT NOT NULL,
    "factors" TEXT NOT NULL,
    "historySummary" TEXT,
    "thresholdSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ThresholdConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "minAmountEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minAmount" REAL NOT NULL DEFAULT 10000,
    "reviewThreshold" REAL NOT NULL DEFAULT 60,
    "blockThreshold" REAL NOT NULL DEFAULT 85,
    "updatedBy" TEXT NOT NULL DEFAULT 'seed',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ThresholdConfigHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "minAmountEnabled" BOOLEAN NOT NULL,
    "minAmount" REAL NOT NULL,
    "reviewThreshold" REAL NOT NULL,
    "blockThreshold" REAL NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");

-- CreateIndex
CREATE INDEX "Transaction_userId_timestamp_idx" ON "Transaction"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "Transaction_timestamp_idx" ON "Transaction"("timestamp");

-- CreateIndex
CREATE INDEX "Transaction_riskLevel_idx" ON "Transaction"("riskLevel");

-- CreateIndex
CREATE INDEX "Transaction_decision_idx" ON "Transaction"("decision");
