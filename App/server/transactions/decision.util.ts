import { Thresholds } from '../settings/thresholds.types';

export type Decision = 'aprobar' | 'revisar' | 'bloquear';
export type RiskLevel = 'bajo' | 'medio' | 'alto' | 'critico';

/**
 * Los rangos de nivel de riesgo se adaptan automaticamente a los umbrales
 * configurados (CU-04 / seccion 6): "alto" arranca en el umbral de revision,
 * "critico" en el de bloqueo, y "medio" en una fraccion proporcional del
 * umbral de revision (replica el 40/60 de la tabla por defecto: 60 * 2/3 = 40).
 */
export function computeRiskLevel(score: number, thresholds: Thresholds): RiskLevel {
  const mediumCutoff = (thresholds.reviewThreshold * 2) / 3;
  if (score >= thresholds.blockThreshold) return 'critico';
  if (score >= thresholds.reviewThreshold) return 'alto';
  if (score >= mediumCutoff) return 'medio';
  return 'bajo';
}

export function computeDecision(score: number, thresholds: Thresholds): { decision: Decision; ruleApplied: string } {
  if (score >= thresholds.blockThreshold) return { decision: 'bloquear', ruleApplied: 'umbral_bloqueo' };
  if (score >= thresholds.reviewThreshold) return { decision: 'revisar', ruleApplied: 'umbral_revision' };
  return { decision: 'aprobar', ruleApplied: 'riesgo_bajo' };
}
