-- Keep database composite constraints represented in Prisma so future migrations preserve isolation.
ALTER TABLE "TransactionReview" DROP CONSTRAINT "TransactionReview_transactionId_fkey";
ALTER TABLE "TransactionReview" DROP CONSTRAINT "TransactionReview_transaction_tenant_fkey";
ALTER TABLE "TransactionReview" ADD CONSTRAINT "TransactionReview_transaction_tenant_fkey" FOREIGN KEY ("transactionId", "tenantId") REFERENCES "Transaction" (id, "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "FraudCase" DROP CONSTRAINT "FraudCase_transactionId_fkey";
ALTER TABLE "FraudCase" DROP CONSTRAINT "FraudCase_transaction_tenant_fkey";
ALTER TABLE "FraudCase" ADD CONSTRAINT "FraudCase_transaction_tenant_fkey" FOREIGN KEY ("transactionId", "tenantId") REFERENCES "Transaction" (id, "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_transactionId_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_transaction_tenant_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_transaction_tenant_fkey" FOREIGN KEY ("transactionId", "tenantId") REFERENCES "Transaction" (id, "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_transactionId_fkey";
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_transaction_tenant_fkey";
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_transaction_tenant_fkey" FOREIGN KEY ("transactionId", "tenantId") REFERENCES "Transaction" (id, "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE UNIQUE INDEX "FraudCase_transactionId_tenantId_key" ON "FraudCase" ("transactionId", "tenantId");
