import { readFileSync, writeFileSync } from 'node:fs';
import { BEHAVIOR_FEATURE_NAMES, FraudModelArtifact } from '../server/risk/anomaly-model';

const reportPath = process.argv[2] || 'evaluation/results/report.json';
const outputPath = process.argv[3] || 'evaluation/results/fraud-model.json';
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
  anomaly_threshold: number;
  sha256: string;
  models_by_currency: Record<string, { means: number[]; scales: number[] }>;
};

if (!Number.isFinite(report.anomaly_threshold) || report.anomaly_threshold === Infinity) {
  throw new Error('Validation did not select a finite anomaly threshold');
}
if (!Object.keys(report.models_by_currency ?? {}).length) throw new Error('Evaluation report has no trained models');

const artifact: FraudModelArtifact = {
  version: 'behavior-anomaly-v1',
  feature_names: [...BEHAVIOR_FEATURE_NAMES],
  threshold: report.anomaly_threshold,
  models_by_currency: report.models_by_currency,
  trained_on: report.sha256,
};
writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + '\n');
console.log(`Wrote ${outputPath} from evaluation ${report.sha256}`);