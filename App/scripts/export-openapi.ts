import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../server/app';

// Writes openapi.json (for Postman, client generators or the repo). test/openapi.test.ts fails if it is stale.
const path = join(__dirname, '..', 'openapi.json');
writeFileSync(path, JSON.stringify(createApp().openApi(), null, 2) + '\n');
console.log(`OpenAPI escrito en ${path}`);
