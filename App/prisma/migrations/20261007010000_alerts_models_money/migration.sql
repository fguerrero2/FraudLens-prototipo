-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "oldBalanceOrig" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "newBalanceOrig" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "oldBalanceDest" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "newBalanceDest" SET DATA TYPE DECIMAL(18,2);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "transactionId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlModel" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "modelType" TEXT NOT NULL,
    "artifactPath" TEXT,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MlModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantModel" (
    "tenantId" UUID NOT NULL,
    "modelId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantModel_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "AuthEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Alert_transactionId_key" ON "Alert"("transactionId");

-- CreateIndex
CREATE INDEX "Alert_tenantId_status_createdAt_idx" ON "Alert"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MlModel_version_key" ON "MlModel"("version");

-- CreateIndex
CREATE INDEX "AuthEvent_createdAt_idx" ON "AuthEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantModel" ADD CONSTRAINT "TenantModel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantModel" ADD CONSTRAINT "TenantModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MlModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Alert"
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_transaction_tenant_fkey"
FOREIGN KEY ("transactionId", "tenantId") REFERENCES "Transaction" (id, "tenantId");
ALTER TABLE "TenantModel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantModel" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantModel"
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
INSERT INTO "MlModel" (id, name, version, "modelType") VALUES ('00000000-0000-4000-8000-000000000010', 'Motor heurístico', 'heuristic-v1', 'heuristic');
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_positive_amount CHECK (amount > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_valid_latitude CHECK (latitude BETWEEN -90 AND 90);
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_valid_longitude CHECK (longitude BETWEEN -180 AND 180);
