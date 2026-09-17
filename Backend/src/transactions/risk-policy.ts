import { VELOCITY_BURST_COUNT } from '../risk/risk.constants';
import { Thresholds } from '../settings/thresholds.types';
import { computeDecision } from './decision.util';

export function isLowAmountExempt(amount: number, recentCount: number, thresholds: Thresholds): boolean {
  return thresholds.minAmountEnabled && amount < thresholds.minAmount && recentCount < VELOCITY_BURST_COUNT;
}

export function decideWithVelocity(score: number, recentCount: number, thresholds: Thresholds) {
  const result = computeDecision(score, thresholds);
  return recentCount >= VELOCITY_BURST_COUNT && result.decision === 'aprobar'
    ? { decision: 'revisar' as const, ruleApplied: 'frecuencia_elevada' }
    : result;
}
