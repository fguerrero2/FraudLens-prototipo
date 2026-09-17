// Run against the built Docker service; fixture writes are rolled back.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { TransactionsService } = require('/app/dist/src/transactions/transactions.service');
const { RiskService } = require('/app/dist/src/risk/risk.service');
const prisma = new PrismaClient();
async function main() {
  const rollback = new Error('ROLLBACK_TEST_FIXTURES');
  const user = `integration-${randomUUID()}`;
  try {
    await prisma.$transaction(async tx => {
      const service = new TransactionsService(tx, new RiskService(), { getThresholds: async () => ({ minAmountEnabled: true, minAmount: 10000, reviewThreshold: 60, blockThreshold: 85 }) });
      const payload = (id, currency, index) => ({ transaction_id: `${user}-${id}`, user_id: user, timestamp: new Date(Date.now() - (20-index)*60000).toISOString(), amount: 100, currency, category: 'food', merchant: 'shop', country: 'AR', channel: 'web' });
      for (let i=0; i<5; i++) await service.create(payload(`usd-${i}`, 'USD', i));
      for (let i=0; i<5; i++) assert.equal((await service.create(payload(`ars-${i}`, 'ARS', i+5))).decision, 'aprobar');
      const sixth = await service.create(payload('sixth', 'ARS', 10));
      assert.equal(sixth.decision, 'revisar'); assert.equal(sixth.rule_applied, 'frecuencia_elevada');
      const first = await service.review(sixth.transaction_id, { outcome: 'pending', analyst: 'Test analyst', comment: 'Requesting evidence' });
      assert.equal(first.review_history.length, 1);
      const second = await service.review(sixth.transaction_id, { outcome: 'fraud', analyst: 'Test analyst', comment: 'Synthetic confirmation' });
      assert.equal(second.review.outcome, 'fraud'); assert.equal(second.review_history.length, 2);
      assert.equal(second.decision, sixth.decision); assert.equal(second.risk_score, sixth.risk_score);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await prisma.transaction.count({ where: { userId: user } }), 0);
  const base = 'http://localhost:3000/api/v1';
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/transactions`)).status, 401);
  assert.equal((await fetch(`${base}/transactions`, { headers: { 'x-api-key': process.env.ANALYST_API_KEY } })).status, 200);
  const review = { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANALYST_API_KEY }, body: JSON.stringify({ outcome: 'fraud', analyst: 'Test analyst', comment: 'Evidence' }) };
  assert.equal((await fetch(`${base}/transactions/${user}/review`, review)).status, 404);
  assert.equal((await fetch(`${base}/transactions/${user}/review`, { ...review, body: JSON.stringify({ outcome: 'invalid' }) })).status, 400);
  assert.equal((await fetch(`${base}/transactions/${user}/review`, { ...review, headers: { ...review.headers, 'x-api-key': process.env.CLIENT_API_KEY } })).status, 401);
  console.log('PASS: PostgreSQL currency isolation, small-amount burst, review persistence/history, rollback, HTTP validation and role authorization.');
}
main().catch(error => { console.error(error); process.exitCode=1; }).finally(() => prisma.$disconnect());
