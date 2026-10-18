-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "PlatformUserRole" (
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "PlatformUserRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "tenantId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiClient" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "secretHash" TEXT NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);


INSERT INTO "Tenant" (id, name, slug, "updatedAt") VALUES ('00000000-0000-4000-8000-000000000001', 'Organización inicial', 'default', NOW());
-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_resourceId_fkey";

-- DropIndex
DROP INDEX "Transaction_externalId_key";

-- DropIndex
DROP INDEX "Transaction_userId_timestamp_idx";

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "modelVersion" TEXT,
ADD COLUMN     "tenantId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
CREATE SEQUENCE thresholdconfig_id_seq;
ALTER TABLE "ThresholdConfig" ADD COLUMN     "defaultCurrency" TEXT NOT NULL DEFAULT 'ARS',
ADD COLUMN     "tenantId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
ALTER COLUMN "id" SET DEFAULT nextval('thresholdconfig_id_seq');
ALTER SEQUENCE thresholdconfig_id_seq OWNED BY "ThresholdConfig"."id";

-- AlterTable
ALTER TABLE "ThresholdConfigHistory" ADD COLUMN     "tenantId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "TransactionReview" ADD COLUMN     "tenantId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "FraudCase" ADD COLUMN     "tenantId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "tenantId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ADD COLUMN     "transactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_clientId_key" ON "ApiCredential"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_secretHash_key" ON "ApiCredential"("secretHash");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_userId_timestamp_idx" ON "Transaction"("tenantId", "userId", "timestamp");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_timestamp_idx" ON "Transaction"("tenantId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_tenantId_externalId_key" ON "Transaction"("tenantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ThresholdConfig_tenantId_key" ON "ThresholdConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThresholdConfig" ADD CONSTRAINT "ThresholdConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThresholdConfigHistory" ADD CONSTRAINT "ThresholdConfigHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionReview" ADD CONSTRAINT "TransactionReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudCase" ADD CONSTRAINT "FraudCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformUserRole" ADD CONSTRAINT "PlatformUserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiClient" ADD CONSTRAINT "ApiClient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Transaction" ALTER COLUMN "tenantId" DROP DEFAULT;

ALTER TABLE "ThresholdConfig" ALTER COLUMN "tenantId" DROP DEFAULT;

ALTER TABLE "ThresholdConfigHistory" ALTER COLUMN "tenantId" DROP DEFAULT;

ALTER TABLE "TransactionReview" ALTER COLUMN "tenantId" DROP DEFAULT;

ALTER TABLE "FraudCase" ALTER COLUMN "tenantId" DROP DEFAULT;

ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" DROP DEFAULT;

SELECT setval('thresholdconfig_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM "ThresholdConfig"), 0), 1), true);
UPDATE "AuditLog" a SET "transactionId" = t.id FROM "Transaction" t
WHERE a."resourceId" = t."externalId" AND a."tenantId" = t."tenantId";

CREATE INDEX "Transaction_tenant_isolation_idx" ON "Transaction" ("tenantId");
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Transaction"
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX "ThresholdConfig_tenant_isolation_idx" ON "ThresholdConfig" ("tenantId");
ALTER TABLE "ThresholdConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ThresholdConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ThresholdConfig"
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX "ThresholdConfigHistory_tenant_isolation_idx" ON "ThresholdConfigHistory" ("tenantId");
ALTER TABLE "ThresholdConfigHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ThresholdConfigHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ThresholdConfigHistory"
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX "TransactionReview_tenant_isolation_idx" ON "TransactionReview" ("tenantId");
ALTER TABLE "TransactionReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransactionReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TransactionReview"
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX "FraudCase_tenant_isolation_idx" ON "FraudCase" ("tenantId");
ALTER TABLE "FraudCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FraudCase" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FraudCase"
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX "AuditLog_tenant_isolation_idx" ON "AuditLog" ("tenantId");
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "AuditLog" FOR SELECT
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_insert ON "AuditLog" FOR INSERT
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX "ApiClient_tenant_isolation_idx" ON "ApiClient" ("tenantId");
ALTER TABLE "ApiClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiClient" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApiClient"
USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE UNIQUE INDEX "Transaction_id_tenantId_key" ON "Transaction" (id, "tenantId");
ALTER TABLE "TransactionReview" ADD CONSTRAINT "TransactionReview_transaction_tenant_fkey" FOREIGN KEY ("transactionId", "tenantId") REFERENCES "Transaction" (id, "tenantId");
ALTER TABLE "FraudCase" ADD CONSTRAINT "FraudCase_transaction_tenant_fkey" FOREIGN KEY ("transactionId", "tenantId") REFERENCES "Transaction" (id, "tenantId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_transaction_tenant_fkey" FOREIGN KEY ("transactionId", "tenantId") REFERENCES "Transaction" (id, "tenantId");
