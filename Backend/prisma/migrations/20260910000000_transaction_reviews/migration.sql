CREATE TABLE "TransactionReview" (
  "id" SERIAL NOT NULL,
  "transactionId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('fraud', 'legitimate', 'pending')),
  "analyst" TEXT NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransactionReview_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TransactionReview_transactionId_createdAt_idx" ON "TransactionReview"("transactionId", "createdAt");
