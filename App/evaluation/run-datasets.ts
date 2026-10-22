import { readFileSync, writeFileSync } from 'node:fs';
import { RiskService } from '../server/risk/risk.service';
import { HistoricalTransaction } from '../server/risk/risk.types';
import { VELOCITY_WINDOW_MINUTES } from '../server/risk/risk.constants';
import { isLowAmountExempt, decideWithVelocity } from '../server/transactions/risk-policy';
import { metrics, StandardizedDistanceModel } from './metrics';

type Row = HistoricalTransaction & { transactionId: string; userId: string; currency: string; isFraud: boolean };
type Prepared = { row: Row; features: number[]; score: number; recent: number; exempt: boolean; alert: boolean };
const [trainPath, validationPath, testPath, outputPath] = process.argv.slice(2);
if (!trainPath || !validationPath || !testPath) throw new Error('Usage: ts-node evaluation/run-datasets.ts TRAIN.jsonl VALIDATION.jsonl TEST.jsonl');
const thresholds = { minAmountEnabled: true, minAmount: 10000, reviewThreshold: 60, blockThreshold: 85 };
const read = (path: string): Row[] => readFileSync(path, 'utf8').trim().split('\n').map(line => {
  const row = JSON.parse(line); row.timestamp = new Date(row.timestamp); return row;
});
const trainRows = read(trainPath), validationRows = read(validationPath), testRows = read(testPath);
const history = new Map<string, Row[]>(), engine = new RiskService();
const prepare = (row: Row): Prepared => {
  const key = JSON.stringify([row.userId, row.currency]);
  const previous = (history.get(key) || []).slice(-200);
  const recent = previous.filter(item => row.timestamp.getTime() - item.timestamp.getTime() <= VELOCITY_WINDOW_MINUTES * 60000).length;
  const profile = previous.slice(-200);
  const risk = engine.calculate({ ...row, currency: row.currency }, profile as HistoricalTransaction[]);
  const average = profile.length ? profile.reduce((sum, item) => sum + item.amount, 0) / profile.length : row.amount;
  const features = [Math.log1p(row.amount), Math.log1p(row.amount / Math.max(average, 1)), Math.log1p(recent),
    Number(profile.length > 0 && !profile.some(item => item.country === row.country)),
    Number(!!row.deviceId && profile.some(item => item.deviceId) && !profile.some(item => item.deviceId === row.deviceId))];
  const exempt = isLowAmountExempt(row.amount, recent, thresholds);
  const alert = !exempt && decideWithVelocity(risk.score, recent, thresholds).decision !== 'aprobar';
  history.set(key, [...previous, row].slice(-200));
  return { row, features, score: risk.score, recent, exempt, alert };
};
const train = trainRows.map(prepare), validation = validationRows.map(prepare), test = testRows.map(prepare);
const model = new StandardizedDistanceModel(); model.fit(train.map(item => item.features));
const anomaly = (item: Prepared) => model.score(item.features);
const candidates = [...new Set(validation.map(anomaly))].sort((a, b) => b - a); let threshold = candidates[0], bestF1 = -1;
for (const candidate of candidates) { const result = metrics(validation.map(item => item.row.isFraud), validation.map(item => anomaly(item) >= candidate)); if (result.f1 > bestF1) { bestF1 = result.f1; threshold = candidate; } }
const result = { protocol: 'Explicit train/validation/test CSV partitions; no test labels used for fitting or threshold selection.', train: train.length, validation: validation.length, test: test.length,
  fraud: { train: train.filter(item => item.row.isFraud).length, validation: validation.filter(item => item.row.isFraud).length, test: test.filter(item => item.row.isFraud).length },
  anomaly_threshold: threshold, models_by_currency: { USD: model.snapshot() }, model: model.snapshot(), validation_metrics: metrics(validation.map(item => item.row.isFraud), validation.map(item => anomaly(item) >= threshold)), test_metrics: metrics(test.map(item => item.row.isFraud), test.map(item => anomaly(item) >= threshold)) };
if (outputPath) writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));