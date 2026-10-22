import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../server/app';

const app = createApp();
const spec: any = app.openApi();

test('OpenAPI documents every served route with a summary, its access rule and unique operationIds', () => {
  const operations = Object.values<any>(spec.paths).flatMap(item => Object.values<any>(item));
  assert.equal(operations.length, app.routes.length);
  for (const route of app.routes) {
    const operation = spec.paths[route.path.replace(/:(\w+)/g, '{$1}')]?.[route.method.toLowerCase()];
    assert.ok(operation, `${route.method} ${route.path} missing`);
    assert.ok(operation.summary, `${route.method} ${route.path} without summary`);
    for (const permission of route.permissions ?? []) assert.match(operation.description, new RegExp(permission.replace('.', '\\.')));
    assert.deepEqual(operation.security, route.public ? [] : [{ bearer: [] }, { apiKey: [] }]);
  }
  assert.equal(new Set(operations.map(o => o.operationId)).size, operations.length);
});

test('OpenAPI request bodies resolve to DTO schemas with their validation rules', () => {
  const text = JSON.stringify(spec);
  for (const [, name] of text.matchAll(/"#\/components\/schemas\/(\w+)"/g)) assert.ok(spec.components.schemas[name], `unresolved $ref ${name}`);
  const login = spec.components.schemas.LoginDto;
  assert.deepEqual([...login.required].sort(), ['email', 'password']);
  assert.equal(login.properties.email.format, 'email');
  const query = spec.paths['/transactions'].get.parameters.find((p: any) => p.name === 'risk_level');
  assert.deepEqual(query.schema.enum, ['bajo', 'medio', 'alto', 'critico', 'no_evaluado']);
});

test('openapi.json in the repo matches the code (regenerate with npm run openapi)', () => {
  const committed = JSON.parse(readFileSync(join(__dirname, '..', 'openapi.json'), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(spec)));
});
