-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "deviceId" TEXT,
    "operationType" TEXT,
    "nameOrig" TEXT,
    "oldBalanceOrig" DOUBLE PRECISION,
    "newBalanceOrig" DOUBLE PRECISION,
    "nameDest" TEXT,
    "oldBalanceDest" DOUBLE PRECISION,
    "newBalanceDest" DOUBLE PRECISION,
    "riskScore" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "decision" TEXT NOT NULL,
    "analyzedByModel" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "ruleApplied" TEXT NOT NULL,
    "factors" TEXT NOT NULL,
    "historySummary" TEXT,
    "thresholdSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThresholdConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minAmountEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minAmount" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "reviewThreshold" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "blockThreshold" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "updatedBy" TEXT NOT NULL DEFAULT 'seed',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThresholdConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThresholdConfigHistory" (
    "id" SERIAL NOT NULL,
    "minAmountEnabled" BOOLEAN NOT NULL,
    "minAmount" DOUBLE PRECISION NOT NULL,
    "reviewThreshold" DOUBLE PRECISION NOT NULL,
    "blockThreshold" DOUBLE PRECISION NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThresholdConfigHistory_pkey" PRIMARY KEY ("id")
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
