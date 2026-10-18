-- Execute as schema owner after prisma migrate deploy.
-- Create the password separately in the provider console; never commit credentials.
CREATE ROLE fraudlens_app LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO fraudlens_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fraudlens_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fraudlens_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fraudlens_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO fraudlens_app;
-- Defense in depth for audit records, in addition to insert/select-only RLS policies.
REVOKE UPDATE, DELETE ON "AuditLog", "AuthEvent" FROM fraudlens_app;
-- Runtime never needs schema migration access.
REVOKE ALL ON "_prisma_migrations" FROM fraudlens_app;
