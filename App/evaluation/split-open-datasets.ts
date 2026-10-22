import { createReadStream, mkdirSync, openSync, closeSync, writeSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

type Domain = 'tarjetas' | 'transferencias';
type Row = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = '', quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted;
    } else if (character === ',' && !quoted) { cells.push(value); value = ''; } else value += character;
  }
  cells.push(value);
  return cells.map(cell => cell.trim());
}

function number(value: string): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid numeric value: ${value}`);
  return result;
}

function normalize(row: Row, domain: Domain, index: number) {
  if (domain === 'tarjetas') {
    return {
      transactionId: `ulb-${row.id || index}`,
      userId: 'ulb-anonymous-card-profile', currency: 'EUR',
      timestamp: new Date(number(row.Time) * 1000).toISOString(),
      amount: number(row.Amount), category: 'card_transaction', merchant: 'anonymous-merchant',
      country: 'unknown', deviceId: 'anonymous-device', isFraud: row.Class === '1',
    };
  }
  return {
    transactionId: `paysim-${row.nameOrig}-${row.step}-${index}`,
    userId: row.nameOrig, currency: 'USD',
    timestamp: new Date(Date.UTC(2017, 0, 1) + number(row.step) * 3_600_000).toISOString(),
    amount: number(row.amount), category: row.type, merchant: row.nameDest, country: 'unknown', deviceId: null,
    isFraud: row.isFraud === '1', operationType: row.type,
    oldBalanceOrig: number(row.oldbalanceOrg), newBalanceOrig: number(row.newbalanceOrig),
    oldBalanceDest: number(row.oldbalanceDest), newBalanceDest: number(row.newbalanceDest),
  };
}

async function split(source: string, domain: Domain, outputRoot: string) {
  const rows: Row[] = [];
  const input = createInterface({ input: createReadStream(source), crlfDelay: Infinity });
  let headers: string[] | null = null;
  for await (const line of input) {
    const cells = parseCsvLine(line);
    if (!headers) { headers = cells; continue; }
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  }
  rows.sort((left, right) => Number(left.Time ?? left.step) - Number(right.Time ?? right.step));
  const normalized = rows.map((row, index) => normalize(row, domain, index));
  const boundaries = [Math.floor(normalized.length * 0.6), Math.floor(normalized.length * 0.8)];
  const outputs = [normalized.slice(0, boundaries[0]), normalized.slice(boundaries[0], boundaries[1]), normalized.slice(boundaries[1])];
  const counts = { train: outputs[0].length, validation: outputs[1].length, test: outputs[2].length };
  const labels = outputs.map(rowsPart => rowsPart.filter(row => row.isFraud).length);
  for (const [index, name] of ['train', 'validation', 'test'].entries()) {
    const directory = `${outputRoot}/${domain}`;
    mkdirSync(directory, { recursive: true });
    const handle = openSync(`${directory}/${name}.jsonl`, 'w');
    for (const row of outputs[index]) writeSync(handle, `${JSON.stringify(row)}\n`);
    closeSync(handle);
  }
  writeFileSync(`${outputRoot}/${domain}/manifest.json`, JSON.stringify({ domain, source, protocol: 'Chronological 60/20/20 split; test is untouched during training and threshold selection.', counts, fraud: { train: labels[0], validation: labels[1], test: labels[2] } }, null, 2) + '\n');
  console.log(`${domain}: ${JSON.stringify(counts)}, fraud=${JSON.stringify({ train: labels[0], validation: labels[1], test: labels[2] })}`);
}

const [cardSource, transferSource, outputRoot = '../Datasets'] = process.argv.slice(2);
if (!cardSource || !transferSource) throw new Error('Usage: ts-node evaluation/split-open-datasets.ts ULB.csv PaySim.csv [output-root]');
Promise.all([split(cardSource, 'tarjetas', outputRoot), split(transferSource, 'transferencias', outputRoot)])
  .catch(error => { console.error(error); process.exitCode = 1; });