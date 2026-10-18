export interface RiskFactor {
  code: string;
  label: string;
  points: number;
}

export interface HistorySummary {
  history_count: number;
  insufficient_history: boolean;
  avg_amount: number | null;
  familiar_countries: string[];
  familiar_categories: string[];
  familiar_devices: string[];
}

export interface RiskResult {
  score: number;
  insufficientHistory: boolean;
  factors: RiskFactor[];
  historySummary: HistorySummary;
}

export interface TransactionSignalInput {
  transactionId: string;
  timestamp: Date;
  amount: number;
  category: string;
  merchant: string;
  country: string;
  currency?: string | null;
  deviceId?: string | null;
  // Senales opcionales estilo PaySim (presentes solo si el cliente las envia).
  operationType?: string | null;
  oldBalanceOrig?: number | null;
  newBalanceOrig?: number | null;
  oldBalanceDest?: number | null;
  newBalanceDest?: number | null;
}

export interface HistoricalTransaction {
  timestamp: Date;
  amount: number;
  category: string;
  merchant: string;
  country: string;
  deviceId: string | null;
}
