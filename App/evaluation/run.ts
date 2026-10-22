import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RiskService } from '../server/risk/risk.service';
import { HistoricalTransaction, TransactionSignalInput } from '../server/risk/risk.types';
import { VELOCITY_WINDOW_MINUTES } from '../server/risk/risk.constants';
import { isLowAmountExempt, decideWithVelocity } from '../server/transactions/risk-policy';
import { metrics, StandardizedDistanceModel } from './metrics';

type Row = TransactionSignalInput & { userId: string; currency: string; isFraud: boolean | null };
const thresholds = { minAmountEnabled: true, minAmount: 10000, reviewThreshold: 60, blockThreshold: 85 };
// Synthetic scenario labels are assigned before scoring. No rule output is used as ground truth.
function synthetic(): Row[] {
  let state = 20260910;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return Array.from({ length: 1800 }, (_, i) => {
    const user = Math.floor(random() * 12), fraud = random() < 0.12;
    const amount = Math.round((3000 + random() * 42000) * (fraud ? 1 + random() * 5 : random() < 0.08 ? 4 : 1));
    return { transactionId: `synthetic-${i}`, userId: `user-${user}`, currency: 'ARS',
      timestamp: new Date(Date.UTC(2025, 0, 1) + i * 120000), amount,
      category: random() < (fraud ? 0.55 : 0.1) ? 'electronics' : 'groceries',
      merchant: random() < (fraud ? 0.65 : 0.15) ? `shop-${i}` : 'usual-shop',
      country: random() < (fraud ? 0.5 : 0.04) ? `country-${i}` : 'Argentina',
      deviceId: random() < (fraud ? 0.6 : 0.07) ? `new-${i}` : `device-${user}`, isFraud: fraud };
  });
}
const inputPath = process.argv[2];
const outputDir = process.argv[3] || 'evaluation/results';
const raw = inputPath ? readFileSync(inputPath, 'utf8') : synthetic().map(row => JSON.stringify(row)).join('\n');
const rows: Row[] = raw.trim().split('\n').map(line => {
  const row = JSON.parse(line); row.timestamp = new Date(row.timestamp);
  if ((typeof row.isFraud !== 'boolean' && row.isFraud !== null) || !Number.isFinite(row.timestamp.getTime()) || !Number.isFinite(row.amount) || row.amount <= 0
    || ['transactionId', 'userId', 'currency', 'country', 'category', 'merchant'].some(key => typeof row[key] !== 'string' || !row[key].trim())) throw new Error('Invalid labeled JSONL row');
  return row;
}).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.transactionId.localeCompare(b.transactionId));
if (rows.length < 30 || new Set(rows.map(row => row.transactionId)).size !== rows.length) throw new Error('Need >=30 rows with unique transactionId');
const dates = [...new Set(rows.map(row => row.timestamp.getTime()))];
const trainEnd = dates[Math.floor(dates.length * 0.6)], validationEnd = dates[Math.floor(dates.length * 0.8)];
const history = new Map<string, Row[]>(), engine = new RiskService();
const prepared = rows.map(row => {
  const key = JSON.stringify([row.userId, row.currency]);
  const previous = (history.get(key) || []).filter(h => h.timestamp < row.timestamp);
  const recent = previous.filter(h => row.timestamp.getTime() - h.timestamp.getTime() <= VELOCITY_WINDOW_MINUTES * 60000).length;
  const profile = previous.slice(-200);
  const risk = engine.calculate(row, profile as HistoricalTransaction[]);
  const average = profile.length ? profile.reduce((sum, h) => sum + h.amount, 0) / profile.length : row.amount;
  const features = [Math.log1p(row.amount), Math.log1p(row.amount / average), Math.log1p(recent),
    Number(profile.length > 0 && !profile.some(h => h.country === row.country)),
    Number(!!row.deviceId && profile.some(h => h.deviceId) && !profile.some(h => h.deviceId === row.deviceId))];
  const exempt = isLowAmountExempt(row.amount, recent, thresholds);
  const alert = !exempt && decideWithVelocity(risk.score, recent, thresholds).decision !== 'aprobar';
  const all = history.get(key) || []; all.push(row); history.set(key, all);
  return { row, features, score: risk.score, recent, exempt, alert };
});
const train = prepared.filter(x => x.row.timestamp.getTime() < trainEnd);
const validation = prepared.filter(x => x.row.timestamp.getTime() >= trainEnd && x.row.timestamp.getTime() < validationEnd && x.row.isFraud !== null);
const test = prepared.filter(x => x.row.timestamp.getTime() >= validationEnd && x.row.isFraud !== null);
for (const [name, partition] of Object.entries({ validation, test })) {
  if (partition.length < 2 || new Set(partition.map(x => x.row.isFraud)).size < 2) throw new Error(`${name} must contain both classes and >=2 samples`);
}
const models = new Map<string, StandardizedDistanceModel>();
for (const currency of new Set(prepared.map(x => x.row.currency))) {
  const model = new StandardizedDistanceModel();
  const examples = train.filter(x => x.row.currency === currency);
  if (examples.length < 2) throw new Error(`Need at least two training events for currency ${currency}`);
  model.fit(examples.map(x => x.features)); models.set(currency, model);
}
const anomalyScore = (x: typeof prepared[number]) => models.get(x.row.currency)!.score(x.features);
const validationScores = validation.map(x => anomalyScore(x));
const candidates = [...new Set(validationScores), Infinity];
let bestThreshold = Infinity, bestF1 = -1;
for (const threshold of candidates.sort((a,b) => b-a)) {
  const result = metrics(validation.map(x => x.row.isFraud as boolean), validationScores.map(score => score >= threshold));
  if (result.f1 > bestF1) { bestF1 = result.f1; bestThreshold = threshold; }
}
let bestRuleThreshold = thresholds.reviewThreshold, bestRuleF1 = -1;
for (let reviewThreshold = thresholds.blockThreshold - 1; reviewThreshold >= 0; reviewThreshold--) {
  const candidate = { ...thresholds, reviewThreshold };
  const result = metrics(validation.map(x => x.row.isFraud as boolean), validation.map(x => !x.exempt && decideWithVelocity(x.score, x.recent, candidate).decision !== 'aprobar'));
  if (result.f1 > bestRuleF1) { bestRuleF1 = result.f1; bestRuleThreshold = reviewThreshold; }
}
const labels = test.map(x => x.row.isFraud as boolean);
const report = {
  dataset: inputPath || 'synthetic-scenarios', sha256: createHash('sha256').update(raw).digest('hex'), seed: inputPath ? null : 20260910,
  limitation: inputPath ? 'Human reviews may be selective or incorrect; unreviewed/pending rows supply history only. Scores are not probabilities. No model deployed.' : 'Synthetic results validate the experiment pipeline, not real-world fraud detection. Anomaly score is not a probability. No model deployed.',
  protocol: 'Chronological 60/20/20 by unique timestamps; train-only mean/std per currency; anomaly and alternative review thresholds chosen on validation F1; test used once. Previous unlabeled events update history, never model parameters.',
  features: ['log_amount', 'log_amount_to_user_average', 'log_recent_count', 'unfamiliar_country', 'new_device'],
  partitions: Object.fromEntries(Object.entries({ train, validation, test }).map(([key, part]) => [key, { count: part.length, fraud: part.filter(x=>x.row.isFraud).length, start: part[0].row.timestamp, end: part[part.length - 1].row.timestamp }])),
  rules_thresholds: thresholds, tuned_review_threshold: bestRuleThreshold, anomaly_threshold: bestThreshold, models_by_currency: Object.fromEntries([...models].map(([currency, model]) => [currency, model.snapshot()])),
  test: { rules: metrics(labels, test.map(x => x.alert)),
    rules_tuned: metrics(labels, test.map(x => !x.exempt && decideWithVelocity(x.score, x.recent, { ...thresholds, reviewThreshold: bestRuleThreshold }).decision !== 'aprobar')), anomaly: metrics(labels, test.map(x => anomalyScore(x) >= bestThreshold)),
    always_legitimate: metrics(labels, test.map(() => false)) },
};
mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/report.json`, JSON.stringify(report, null, 2) + '\n');
writeFileSync(`${outputDir}/predictions.jsonl`, test.map(x => JSON.stringify({ transactionId: x.row.transactionId, isFraud: x.row.isFraud, ruleScore: x.score, exempt: x.exempt, ruleAlert: x.alert, anomalyScore: anomalyScore(x), anomalyAlert: anomalyScore(x) >= bestThreshold })).join('\n') + '\n');
console.log(JSON.stringify(report, null, 2));
