-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "nameDest" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "nameOrig" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "newBalanceDest" REAL;
ALTER TABLE "Transaction" ADD COLUMN "newBalanceOrig" REAL;
ALTER TABLE "Transaction" ADD COLUMN "oldBalanceDest" REAL;
ALTER TABLE "Transaction" ADD COLUMN "oldBalanceOrig" REAL;
ALTER TABLE "Transaction" ADD COLUMN "operationType" TEXT;
