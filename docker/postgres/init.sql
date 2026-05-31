-- Runs once on first volume initialization (data dir empty), against the default `postgres` DB.
-- Postgres lacks `CREATE DATABASE IF NOT EXISTS`, so use the \gexec guard to stay re-run-safe.
SELECT 'CREATE DATABASE logger_example'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logger_example')\gexec
