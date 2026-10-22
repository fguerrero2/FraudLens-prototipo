-- CreateTable
CREATE TABLE "QrChallenge" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "userId" UUID,
    "tenantId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QrChallenge_expiresAt_idx" ON "QrChallenge"("expiresAt");

-- The runtime role needs explicit access when default privileges were granted by another owner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fraudlens_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "QrChallenge" TO fraudlens_app;
  END IF;
END $$;
