import { createReadStream, mkdirSync } from 'node:fs';
import { closeSync, openSync, writeSync } from 'node:fs';
import { createInterface } from 'node:readline';

type CsvRow = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const row: string[] = [];
  let value = '', quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(value); value = ''; } else value += character;
  }
  row.push(value);
  return row.map(cell => cell.trim());
}

function number(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(row: CsvRow, source: 'train' | 'validation' | 'test', index: number) {
  const start = source === 'train' ? Date.UTC(2020, 0, 1) : source === 'validation' ? Date.UTC(2021, 0, 1) : Date.UTC(2022, 0, 1);
  {
    const isTraining = 'Class' in row;
    const isValidation = 'transaction_hour' in row;
    const amount = number(isTraining ? row.Amount : isValidation ? row.amount : row.amt);
    const fraud = number(isTraining ? row.Class : row.is_fraud) === 1;
    const country = isValidation ? (row.foreign_transaction === '1' ? 'foreign' : 'local') : 'dataset-country';
    const category = isTraining ? 'card_transaction' : isValidation ? row.merchant_category : row.category;
    const merchant = isTraining ? 'anonymous-merchant' : isValidation ? row.merchant_category : row.merchant;
    const userId = 'anonymous-card-profile';
    const deviceId = isValidation ? `trust-${row.device_trust_score}` : 'anonymous-device';
    return {
      transactionId: `${source}-${row.transaction_id || row.id || row.trans_num || index}`,
      userId, currency: 'USD',
      timestamp: new Date(start + index * 60_000).toISOString(),
      amount, category, merchant, country, deviceId,
      isFraud: fraud,
    };
  }
}

const [trainPath, validationPath, testPath, outputDir = 'evaluation/results/real-datasets'] = process.argv.slice(2);
if (!trainPath || !validationPath || !testPath) throw new Error('Usage: ts-node evaluation/prepare-datasets.ts TRAIN.csv VALIDATION.csv TEST.csv [output-dir]');
mkdirSync(outputDir, { recursive: true });
const files: Array<[string, 'train' | 'validation' | 'test']> = [[trainPath, 'train'], [validationPath, 'validation'], [testPath, 'test']];
async function main() {
  for (const [path, source] of files) {
    const destination = `${outputDir}/${source}.jsonl`;
    const outputHandle = openSync(destination, 'w');
    const input = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    let headers: string[] | null = null, count = 0;
    for await (const line of input) {
      const cells = parseCsvLine(line);
      if (!headers) { headers = cells; continue; }
      const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
      writeSync(outputHandle, `${JSON.stringify(normalize(row, source, count))}\n`);
      count++;
    }
    closeSync(outputHandle);
    console.log(`${source}: ${count} rows -> ${destination}`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });