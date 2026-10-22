import { readFileSync } from 'node:fs';

export const BEHAVIOR_FEATURE_NAMES = [
  'log_amount',
  'log_amount_to_user_average',
  'log_recent_count',
  'unfamiliar_country',
  'new_device',
] as const;

export type BehaviorFeatures = Record<(typeof BEHAVIOR_FEATURE_NAMES)[number], number>;

interface ModelSnapshot {
  means: number[];
  scales: number[];
}

export interface FraudModelArtifact {
  version: string;
  feature_names: string[];
  threshold: number;
  model?: ModelSnapshot;
  models_by_currency?: Record<string, ModelSnapshot>;
  trained_on?: string;
}

export class AnomalyModel {
  private constructor(private readonly artifact: FraudModelArtifact) {}

  static load(path: string): AnomalyModel {
    const artifact = JSON.parse(readFileSync(path, 'utf8')) as FraudModelArtifact;
    if (!Number.isFinite(artifact.threshold) || !Array.isArray(artifact.feature_names) || artifact.feature_names.length !== BEHAVIOR_FEATURE_NAMES.length) {
      throw new Error('Invalid fraud model artifact');
    }
    const snapshots = [artifact.model, ...Object.values(artifact.models_by_currency ?? {})].filter(Boolean) as ModelSnapshot[];
    if (!snapshots.length || snapshots.some(snapshot => snapshot.means.length !== BEHAVIOR_FEATURE_NAMES.length || snapshot.scales.length !== BEHAVIOR_FEATURE_NAMES.length)) {
      throw new Error('Fraud model artifact has invalid parameters');
    }
    return new AnomalyModel(artifact);
  }

  score(features: BehaviorFeatures, currency?: string | null): number {
    const snapshot = (currency && this.artifact.models_by_currency?.[currency]) || this.artifact.model;
    if (!snapshot) return 0;
    const values = BEHAVIOR_FEATURE_NAMES.map(name => features[name]);
    return Math.sqrt(values.reduce((sum, value, index) => sum + ((value - snapshot.means[index]) / snapshot.scales[index]) ** 2, 0) / values.length);
  }

  isAnomalous(score: number): boolean {
    return score >= this.artifact.threshold;
  }

  get version(): string { return this.artifact.version; }

  get threshold(): number {
    return this.artifact.threshold;
  }
}

export function loadConfiguredAnomalyModel(): AnomalyModel | null {
  const path = process.env.FRAUD_MODEL_PATH;
  if (!path) return null;
  return AnomalyModel.load(path);
}