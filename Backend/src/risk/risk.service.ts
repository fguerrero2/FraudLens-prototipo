import { Injectable } from '@nestjs/common';
import {
  HOUR_TOLERANCE,
  MIN_HISTORY_FOR_CONFIDENCE,
  NO_HISTORY_BASE_SCORE,
  PARTIAL_HISTORY_POINTS,
  PAYSIM_BALANCE_EPSILON,
  PAYSIM_FRAUD_PRONE_TYPES,
  PAYSIM_LARGE_TRANSFER_LIMIT,
  PAYSIM_WEIGHTS,
  RISK_WEIGHTS,
  VELOCITY_BURST_COUNT,
  VELOCITY_WINDOW_MINUTES,
} from './risk.constants';
import { HistoricalTransaction, HistorySummary, RiskFactor, RiskResult, TransactionSignalInput } from './risk.types';

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

/** Ruido determinista (0-11) derivado del id de transaccion, para que operaciones
 * habituales no den siempre exactamente el mismo puntaje "plano". */
function deterministicNoise(transactionId: string): number {
  let hash = 0;
  for (let i = 0; i < transactionId.length; i++) {
    hash = (hash * 31 + transactionId.charCodeAt(i)) >>> 0;
  }
  return hash % 12;
}

@Injectable()
export class RiskService {
  calculate(input: TransactionSignalInput, history: HistoricalTransaction[]): RiskResult {
    const historyCount = history.length;
    const noise = deterministicNoise(input.transactionId);

    if (historyCount === 0) {
      const factors: RiskFactor[] = [
        {
          code: 'insufficient_history',
          label: 'Historial insuficiente: primera operacion registrada del usuario',
          points: NO_HISTORY_BASE_SCORE,
        },
        ...computePaySimFactors(input),
      ];
      const score = factors.reduce((sum, f) => sum + f.points, 0) + noise;
      factors.sort((a, b) => b.points - a.points);
      return {
        score: clamp(score),
        insufficientHistory: true,
        factors,
        historySummary: emptyHistorySummary(),
      };
    }

    const factors: RiskFactor[] = [...computePaySimFactors(input)];

    const amounts = history.map((h) => h.amount);
    const avgAmount = mean(amounts);
    const stdAmount = stddev(amounts, avgAmount) || avgAmount * 0.5 || 1;
    const zScore = (input.amount - avgAmount) / stdAmount;
    if (zScore > 0.5) {
      const points = Math.min(RISK_WEIGHTS.amountDeviation, Math.round((zScore / 3) * RISK_WEIGHTS.amountDeviation));
      if (points > 0) {
        factors.push({
          code: 'amount_deviation',
          label: zScore >= 4 ? 'Monto muy superior al habitual' : 'Monto superior al habitual',
          points,
        });
      }
    }

    const familiarCountries = new Set(history.map((h) => h.country));
    if (!familiarCountries.has(input.country)) {
      factors.push({ code: 'unfamiliar_country', label: 'Ubicacion no frecuente', points: RISK_WEIGHTS.unfamiliarCountry });
    }

    const familiarCategories = new Set(history.map((h) => h.category));
    const familiarMerchants = new Set(history.map((h) => h.merchant));
    if (!familiarCategories.has(input.category) && !familiarMerchants.has(input.merchant)) {
      factors.push({
        code: 'unfamiliar_category',
        label: 'Comercio o categoria no habitual',
        points: RISK_WEIGHTS.unfamiliarCategory,
      });
    }

    const usualHours = new Set(history.map((h) => h.timestamp.getUTCHours()));
    const currentHour = input.timestamp.getUTCHours();
    const closeToUsualHour = [...usualHours].some((h) => hourDistance(h, currentHour) <= HOUR_TOLERANCE);
    if (!closeToUsualHour) {
      factors.push({ code: 'unusual_hour', label: 'Horario inusual', points: RISK_WEIGHTS.unusualHour });
    }

    const familiarDevices = new Set(history.map((h) => h.deviceId).filter((d): d is string => !!d));
    if (input.deviceId && familiarDevices.size > 0 && !familiarDevices.has(input.deviceId)) {
      factors.push({ code: 'new_device', label: 'Dispositivo no reconocido', points: RISK_WEIGHTS.newDevice });
    }

    const windowStart = input.timestamp.getTime() - VELOCITY_WINDOW_MINUTES * 60_000;
    const recentCount = history.filter((h) => h.timestamp.getTime() >= windowStart).length;
    if (recentCount >= VELOCITY_BURST_COUNT) {
      factors.push({
        code: 'velocity_burst',
        label: 'Frecuencia de operaciones elevada',
        points: RISK_WEIGHTS.velocityBurst,
      });
    }

    const insufficientHistory = historyCount < MIN_HISTORY_FOR_CONFIDENCE;
    if (insufficientHistory) {
      factors.push({
        code: 'insufficient_history',
        label: `Historial insuficiente (solo ${historyCount} operacion${historyCount === 1 ? '' : 'es'} previa${historyCount === 1 ? '' : 's'})`,
        points: PARTIAL_HISTORY_POINTS,
      });
    }

    if (factors.length === 0) {
      factors.push({ code: 'habitual_pattern', label: 'Patron habitual del usuario', points: noise });
    }

    const rawScore = factors.reduce((sum, f) => sum + f.points, 0) + (factors[0]?.code === 'habitual_pattern' ? 0 : noise);

    factors.sort((a, b) => b.points - a.points);

    return {
      score: clamp(rawScore),
      insufficientHistory,
      factors,
      historySummary: {
        history_count: historyCount,
        insufficient_history: insufficientHistory,
        avg_amount: Math.round(avgAmount * 100) / 100,
        familiar_countries: [...familiarCountries],
        familiar_categories: [...familiarCategories],
        familiar_devices: [...familiarDevices],
      },
    };
  }
}

/**
 * Senales inspiradas en la ingenieria de features tipica de PaySim: se activan
 * solo si el cliente envio operation_type + saldos, y solo para TRANSFER/CASH_OUT
 * (los unicos tipos donde ese dataset registra fraude). No dependen del historial.
 */
function computePaySimFactors(input: TransactionSignalInput): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (input.operationType && input.amount > PAYSIM_LARGE_TRANSFER_LIMIT && input.operationType === 'TRANSFER') {
    factors.push({
      code: 'large_transfer_flag',
      label: `Transferencia superior al limite de control (${PAYSIM_LARGE_TRANSFER_LIMIT.toLocaleString('es-AR')})`,
      points: PAYSIM_WEIGHTS.largeTransferFlag,
    });
  }

  const isFraudProneType = !!input.operationType && PAYSIM_FRAUD_PRONE_TYPES.includes(input.operationType);
  if (!isFraudProneType) return factors;

  if (input.oldBalanceOrig != null && input.newBalanceOrig != null) {
    const errorBalanceOrig = input.oldBalanceOrig - input.amount - input.newBalanceOrig;
    if (Math.abs(errorBalanceOrig) > PAYSIM_BALANCE_EPSILON) {
      factors.push({
        code: 'balance_inconsistency',
        label: 'El saldo de la cuenta de origen no coincide con el monto de la operacion',
        points: PAYSIM_WEIGHTS.balanceInconsistency,
      });
    }

    const fullyDrained =
      input.oldBalanceOrig > 0 &&
      input.newBalanceOrig === 0 &&
      Math.abs(input.oldBalanceOrig - input.amount) <= PAYSIM_BALANCE_EPSILON;
    if (fullyDrained) {
      factors.push({
        code: 'origin_drained',
        label: 'Vaciamiento total de la cuenta de origen',
        points: PAYSIM_WEIGHTS.originDrained,
      });
    }
  }

  if (input.oldBalanceDest != null && input.newBalanceDest != null) {
    const destUnchanged = input.oldBalanceDest === 0 && input.newBalanceDest === 0 && input.amount > 0;
    if (destUnchanged) {
      factors.push({
        code: 'dest_balance_unchanged',
        label: 'El saldo de la cuenta destino no reflejo la operacion recibida',
        points: PAYSIM_WEIGHTS.destBalanceUnchanged,
      });
    }
  }

  return factors;
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hourDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 24 - diff);
}

function emptyHistorySummary(): HistorySummary {
  return {
    history_count: 0,
    insufficient_history: true,
    avg_amount: null,
    familiar_countries: [],
    familiar_categories: [],
    familiar_devices: [],
  };
}
