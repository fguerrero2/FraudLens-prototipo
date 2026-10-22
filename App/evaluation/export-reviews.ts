import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';

const prisma = new PrismaClient();
async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: npm run evaluation:export -- /path/dataset.jsonl');
  const tenantId = process.env.EVALUATION_TENANT_ID;
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error('Defina EVALUATION_TENANT_ID para exportar una sola organización');
  const records = await prisma.$transaction(async db => {
    await db.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return db.transaction.findMany({ where: { tenantId }, orderBy: [{ timestamp: 'asc' }, { externalId: 'asc' }], include: { reviews: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } } });
  });
  const rows = records.map(row => ({ transactionId: row.externalId, userId: row.userId, currency: row.currency,
    timestamp: row.timestamp, amount: row.amount, category: row.category, merchant: row.merchant, country: row.country, deviceId: row.deviceId,
    operationType: row.operationType, oldBalanceOrig: row.oldBalanceOrig, newBalanceOrig: row.newBalanceOrig,
    oldBalanceDest: row.oldBalanceDest, newBalanceDest: row.newBalanceDest,
    isFraud: row.reviews[0]?.outcome === 'fraud' ? true : row.reviews[0]?.outcome === 'legitimate' ? false : null }));
  writeFileSync(path, rows.map(row => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Exported ${rows.length} events, ${rows.filter(row => row.isFraud !== null).length} labeled. Existing files are not overwritten.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
