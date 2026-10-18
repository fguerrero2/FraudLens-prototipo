ALTER TABLE "Transaction" ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "FraudCase" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "reason" TEXT NOT NULL,
  "assignedTo" TEXT,
  "resolution" TEXT,
  "createdBy" TEXT NOT NULL,
  "resolvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "FraudCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FraudCase_transactionId_key" UNIQUE ("transactionId"),
  CONSTRAINT "FraudCase_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FraudCase_status_priority_idx" ON "FraudCase"("status", "priority");
CREATE INDEX "FraudCase_createdAt_idx" ON "FraudCase"("createdAt");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "outcome" TEXT NOT NULL,
  "metadata" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Transaction"("externalId") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_resourceType_resourceId_createdAt_idx" ON "AuditLog"("resourceType", "resourceId", "createdAt");
CREATE INDEX "AuditLog_actor_createdAt_idx" ON "AuditLog"("actor", "createdAt");