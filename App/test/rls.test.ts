import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';
test('Migrations preserve legacy data; PostgreSQL RLS rejects reads/writes across tenants and without context', async () => {
  const db = new PGlite();
  try {
    const migrations = readdirSync(join(__dirname, '../prisma/migrations')).filter(name => /^\d/.test(name)).sort();
    for (const name of migrations) {
      if (name === '20261007000000_multitenancy') {
        // Existing prototype data must survive tenant backfill and audit FK replacement.
        await db.exec(`INSERT INTO "Transaction" (id, "externalId", "userId", timestamp, amount, currency, category, merchant, country, channel, decision, "analyzedByModel", status, "ruleApplied", factors, "thresholdSnapshot") VALUES ('legacy', 'same-id', 'customer', NOW(), 100, 'ARS', 'food', 'shop', 'AR', 'web', 'aprobar', false, 'no_evaluada', 'monto_minimo', '[]', '{}');
          INSERT INTO "ThresholdConfig" (id, "updatedAt") VALUES (1, NOW());
          INSERT INTO "AuditLog" (id, actor, "actorRole", action, "resourceType", "resourceId", outcome, metadata) VALUES ('legacy-audit', 'test', 'admin', 'received', 'transaction', 'same-id', 'ok', '{}');`);
      }
      await db.exec(readFileSync(join(__dirname, '../prisma/migrations', name, 'migration.sql'), 'utf8'));
    }
    const legacy = await db.query<{ tenantId: string }>('SELECT "tenantId" FROM "Transaction" WHERE id = $1', ['legacy']);
    assert.equal(legacy.rows[0].tenantId, tenantA);
    const audit = await db.query<{ transactionId: string }>('SELECT "transactionId" FROM "AuditLog" WHERE id = $1', ['legacy-audit']);
    assert.equal(audit.rows[0].transactionId, 'legacy');
    await db.exec(`INSERT INTO "Tenant" (id, name, slug, "updatedAt") VALUES ('${tenantB}', 'B', 'b', NOW());
      INSERT INTO "Transaction" (id, "tenantId", "externalId", "userId", timestamp, amount, currency, category, merchant, country, channel, decision, "analyzedByModel", status, "ruleApplied", factors, "thresholdSnapshot") SELECT 'other', '${tenantB}', "externalId", "userId", timestamp, amount, currency, category, merchant, country, channel, decision, "analyzedByModel", status, "ruleApplied", factors, "thresholdSnapshot" FROM "Transaction" WHERE id = 'legacy';
      CREATE ROLE app_test NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO app_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_test;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_test;
      SET ROLE app_test;`);
    assert.equal((await db.query('SELECT * FROM "Transaction"')).rows.length, 0);
    await db.exec(`BEGIN; SELECT set_config('app.tenant_id', '${tenantA}', true);`);
    assert.deepEqual((await db.query<{ id: string }>('SELECT id FROM "Transaction"')).rows.map(r => r.id), ['legacy']);
    assert.equal((await db.query('UPDATE "Transaction" SET amount = 500 WHERE id = $1 RETURNING id', ['other'])).rows.length, 0);
    assert.equal((await db.query('UPDATE "AuditLog" SET actor = $1 RETURNING id', ['tampered'])).rows.length, 0);
    assert.equal((await db.query('DELETE FROM "AuditLog" RETURNING id')).rows.length, 0);
    await db.exec('COMMIT');
    assert.equal((await db.query('SELECT * FROM "Transaction"')).rows.length, 0); // pooled connection context does not leak
    await assert.rejects(db.exec(`INSERT INTO "ThresholdConfig" ("tenantId", "updatedAt") VALUES ('${tenantB}', NOW())`), /row-level security/);
    await db.exec(`BEGIN; SELECT set_config('app.tenant_id', '${tenantA}', true);`);
    await assert.rejects(db.exec(`INSERT INTO "TransactionReview" ("tenantId", "transactionId", outcome, analyst, comment) VALUES ('${tenantA}', 'other', 'fraud', 'test', 'evidence')`), /foreign key constraint/);
    await db.exec('ROLLBACK');
  } finally { await db.close(); }
});
