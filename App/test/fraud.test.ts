import { tenantContext } from '../server/common/context/tenant-context';
import { test as nodeTest } from 'node:test';
import * as assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validate } from 'class-validator';
import { RiskService } from '../server/risk/risk.service';
import { TransactionsService } from '../server/transactions/transactions.service';
import { ReviewTransactionDto } from '../server/transactions/dto/review-transaction.dto';
import { isLowAmountExempt, decideWithVelocity } from '../server/transactions/risk-policy';
import { metrics, StandardizedDistanceModel } from '../evaluation/metrics';
import { AnomalyModel, BEHAVIOR_FEATURE_NAMES } from '../server/risk/anomaly-model';

const tenantId = '00000000-0000-4000-8000-000000000001';
function test(name: string, fn: (...args: any[]) => any) {
  return nodeTest(name, t => tenantContext.run({ identity: { tenantId, actor: 'test', permissions: [], platformRoles: [] }, db: { $queryRaw: async () => [], $executeRaw: async () => 0 } as any }, () => fn(t)));
}

const thresholds = { minAmountEnabled: true, minAmount: 10000, reviewThreshold: 60, blockThreshold: 85 };
const input = { transactionId: 'a', timestamp: new Date('2026-09-01T12:00:00Z'), amount: 20000, category: 'food', merchant: 'shop', country: 'AR', deviceId: 'known' };
const history = [1, 2, 3].map(day => ({ ...input, timestamp: new Date(`2026-08-0${day}T12:00:00Z`) }));

test('Changing only transaction ID cannot change the risk score or factors', () => {
  const service = new RiskService();
  assert.deepEqual(service.calculate(input, history), service.calculate({ ...input, transactionId: 'totally-different' }, history));
  assert.equal(service.calculate(input, history).score, 0);
});

test('Future and same-time operations cannot contaminate risk history', () => {
  const service = new RiskService();
  const invalid = [input, { ...input, timestamp: new Date('2026-10-01'), amount: 9999999 }];
  assert.deepEqual(service.calculate(input, [...history, ...invalid]), service.calculate(input, history));
});

test('Sixth small operation is reviewed; exemption still applies below burst threshold', () => {
  assert.equal(isLowAmountExempt(100, 4, thresholds), true);
  assert.equal(isLowAmountExempt(100, 5, thresholds), false);
  assert.equal(decideWithVelocity(10, 5, thresholds).decision, 'revisar');
  assert.equal(decideWithVelocity(90, 5, thresholds).decision, 'bloquear');
  assert.equal(isLowAmountExempt(10000, 0, thresholds), false);
});

function mockService(recentCount = 0) {
  const calls: any = {};
  const prisma: any = { tenantModel: { findUnique: async () => null }, alert: { create: async () => ({}) }, auditLog: { create: async () => ({}) }, transaction: {
    findUnique: async () => null,
    count: async args => { calls.count = args; return recentCount; },
    findMany: async args => { calls.history = args; return history; },
    create: async ({ data }) => { calls.created = data; return { ...data, id: 'internal', createdAt: new Date() }; },
  } };
  const service = new TransactionsService(prisma, new RiskService(), { getThresholds: async () => thresholds } as any);
  return { service, prisma, calls };
}
function payload(amount = 20000) {
  return { transaction_id: 'test', user_id: 'u', timestamp: new Date(Date.now() - 60000).toISOString(), amount, currency: 'ARS', category: 'food', merchant: 'shop', country: 'AR', channel: 'web' };
}

test('Database profile and velocity queries restrict user, currency and past time', async () => {
  const { service, calls } = mockService(); const dto = payload(); await service.create(dto);
  assert.deepEqual(calls.history.where, { tenantId, userId: 'u', currency: 'ARS', timestamp: { lt: new Date(dto.timestamp) } });
  assert.equal(calls.count.where.currency, 'ARS');
  assert.deepEqual(calls.count.where.timestamp.lt, new Date(dto.timestamp));
  assert.equal(calls.count.where.timestamp.lt - calls.count.where.timestamp.gte, 3600000);
  assert.equal(calls.history.take, 200);
});

test('Low amount burst reaches risk analysis and is not silently approved', async () => {
  const { service, calls } = mockService(5);
  const result = await service.create(payload(100));
  assert.equal(result.decision, 'revisar'); assert.ok(calls.history);
  assert.equal(result.rule_applied, 'frecuencia_elevada');
});

test('Low amount without burst remains explicitly exempt', async () => {
  const { service, calls } = mockService(4);
  const result = await service.create(payload(100));
  assert.equal(result.decision, 'aprobar'); assert.equal(result.risk_score, null);
  assert.equal(calls.history, undefined);
});

test('Scoring failure routes an operation to manual review', async () => {
  const { prisma } = mockService(5);
  const service = new TransactionsService(prisma, { calculate() { throw new Error('test failure'); } } as any, { getThresholds: async () => thresholds } as any);
  const result = await service.create(payload());
  assert.equal(result.decision, 'revisar'); assert.equal(result.status, 'analisis_no_disponible');
});

test('Human review is appended and leaves automatic result intact', async () => {
  const { service, prisma, calls } = mockService(); await service.create(payload());
  const record = { ...calls.created, id: 'internal', createdAt: new Date() };
  prisma.transaction.findUnique = async () => record;
  const reviews: any[] = [];
  prisma.transactionReview = { create: async ({ data }) => { reviews.unshift({ ...data, id: reviews.length + 1, createdAt: new Date() }); }, findMany: async () => reviews };
  const first = await service.review('test', { outcome: 'fraud', analyst: 'Ana', comment: 'Confirmed by customer' });
  const second = await service.review('test', { outcome: 'legitimate', analyst: 'Luis', comment: 'Correction with evidence' });
  assert.equal(first.review.outcome, 'fraud');
  assert.equal(second.review.outcome, 'legitimate'); assert.equal(second.review_history.length, 2);
  assert.equal(second.decision, record.decision); assert.equal(second.risk_score, record.riskScore);
});

test('Missing transaction cannot receive a review', async () => {
  const { service } = mockService();
  await assert.rejects(service.review('missing', { outcome: 'fraud', analyst: 'Ana', comment: 'Evidence' }), /No existe/);
});

test('Review DTO rejects invalid outcome and missing evidence', async () => {
  const invalid = Object.assign(new ReviewTransactionDto(), { outcome: 'approve', analyst: '', comment: '' });
  assert.equal((await validate(invalid)).length, 3);
  assert.equal((await validate(Object.assign(new ReviewTransactionDto(), { outcome: 'pending', analyst: 'Ana', comment: 'Need evidence' }))).length, 0);
});

test('Evaluation metrics match known confusion matrix and handle no alerts', () => {
  const result = metrics([true, true, false, false], [true, false, true, false]);
  assert.equal(result.tp, 1); assert.equal(result.fp, 1); assert.equal(result.tn, 1); assert.equal(result.fn, 1);
  assert.equal(result.precision, 0.5); assert.equal(result.recall, 0.5); assert.equal(result.f1, 0.5);
  assert.equal(metrics([true, false], [false, false]).f1, 0);
});

test('Anomaly model learns only fit data and scoring never changes parameters', () => {
  const model = new StandardizedDistanceModel(); model.fit([[1, 2], [2, 3], [3, 4]]);
  const snapshot = JSON.stringify(model.snapshot());
  assert.ok(model.score([100, 100]) > model.score([2, 3]));
  assert.equal(JSON.stringify(model.snapshot()), snapshot);
});

test('Promoted anomaly artifact flags an atypical transaction', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fraudlens-'));
  const path = join(directory, 'model.json');
  writeFileSync(path, JSON.stringify({
    version: 'behavior-anomaly-v1', feature_names: [...BEHAVIOR_FEATURE_NAMES], threshold: 1,
    models_by_currency: { ARS: { means: [1, 1, 0, 0, 0], scales: [1, 1, 1, 1, 1] } },
  }));
  const model = AnomalyModel.load(path);
  assert.equal(model.isAnomalous(model.score({ log_amount: 1, log_amount_to_user_average: 1, log_recent_count: 0, unfamiliar_country: 0, new_device: 0 }, 'ARS')), false);
  assert.equal(model.isAnomalous(model.score({ log_amount: 5, log_amount_to_user_average: 1, log_recent_count: 0, unfamiliar_country: 0, new_device: 0 }, 'ARS')), true);
});
