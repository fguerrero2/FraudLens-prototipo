// Puntaje maximo que puede aportar cada senal. La suma de los maximos da 100.
export const RISK_WEIGHTS = {
  amountDeviation: 35,
  unfamiliarCountry: 20,
  unfamiliarCategory: 12,
  unusualHour: 10,
  newDevice: 13,
  velocityBurst: 10,
};

// Cantidad minima de operaciones previas para considerar el historial confiable.
export const MIN_HISTORY_FOR_CONFIDENCE = 3;

// Puntaje base para un usuario sin ningun historial (ni alto ni bajo: incertidumbre real).
export const NO_HISTORY_BASE_SCORE = 45;

// Penalizacion por historial parcial (1 o 2 operaciones previas).
export const PARTIAL_HISTORY_POINTS = 15;

export const VELOCITY_WINDOW_MINUTES = 60;
export const VELOCITY_BURST_COUNT = 5;

// Tolerancia en horas alrededor de un horario historico para considerarlo habitual.
export const HOUR_TOLERANCE = 3;

// Senales inspiradas en PaySim (Synthetic Financial Datasets For Fraud
// Detection), aplicadas solo cuando el cliente envia operation_type + saldos.
// En ese dataset el fraude ocurre unicamente en TRANSFER/CASH_OUT, por eso
// estas senales se activan solo para esos dos tipos.
export const PAYSIM_FRAUD_PRONE_TYPES = ['TRANSFER', 'CASH_OUT'];
export const PAYSIM_WEIGHTS = {
  balanceInconsistency: 15,
  originDrained: 25,
  destBalanceUnchanged: 20,
  largeTransferFlag: 20,
};
export const PAYSIM_BALANCE_EPSILON = 1; // tolerancia numerica para comparar saldos
// Replica la regla de negocio de PaySim: transferencias > 200.000 se marcan (isFlaggedFraud).
export const PAYSIM_LARGE_TRANSFER_LIMIT = 200000;
