export function metrics(labels: boolean[], predictions: boolean[]) {
  if (labels.length !== predictions.length || !labels.length) throw new Error('Expected nonempty aligned labels/predictions');
  let tp = 0, fp = 0, tn = 0, fn = 0;
  labels.forEach((label, i) => { if (label) predictions[i] ? tp++ : fn++; else predictions[i] ? fp++ : tn++; });
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, tn, fn, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    false_positive_rate: fp + tn ? fp / (fp + tn) : null, alert_rate: (tp + fp) / labels.length, samples: labels.length };
}

// A deliberately simple trained anomaly baseline, not a fraud probability.
export class StandardizedDistanceModel {
  private means: number[] = [];
  private scales: number[] = [];
  fit(rows: number[][]) {
    if (rows.length < 2) throw new Error('At least two training samples required');
    this.means = rows[0].map((_, j) => rows.reduce((sum, row) => sum + row[j], 0) / rows.length);
    this.scales = this.means.map((mean, j) => Math.max(1e-6, Math.sqrt(rows.reduce((sum, row) => sum + (row[j] - mean) ** 2, 0) / rows.length)));
  }
  score(row: number[]) {
    if (!this.means.length) throw new Error('Model must be fitted first');
    return Math.sqrt(row.reduce((sum, value, j) => sum + ((value - this.means[j]) / this.scales[j]) ** 2, 0) / row.length);
  }
  snapshot() { return { means: this.means, scales: this.scales }; }
}
