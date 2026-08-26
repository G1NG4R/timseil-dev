#!/bin/sh
# The three database roles, created once when initdb builds the cluster.
#
# F3 ADDED THE THIRD, AND THE HEADER BELOW IS WHY THAT IS NOT ENOUGH. This file
# runs only on a fresh data directory. Production has had one since D2, so
# adding timseil_metrics here creates it on every NEW cluster and on the running
# one never. The step for the existing cluster is a psql session in
# docs/runbooks/migrations.md, and it is not optional: without it
# postgres-exporter starts, fails to authenticate, and up{job="postgres"} stays
# 0 while everything else is green. ADR 0040 3.
#
# Why here and not in a migration: roles are cluster-wide objects, not schema
# objects. A migration that created them would have to drop them again on the
# way down, and DROP ROLE fails while a single grant still refers to the role —
# so the second up/down cycle would go red. The privileges those roles get DO
# belong to the schema lifecycle and live in migration 00001. ADR 0011.
#
# Why .sh and not .sql: only shell files in /docker-entrypoint-initdb.d/ see the
# container's environment. The passwords therefore come from .env and appear in
# no file in this repository.
#
# This runs ONLY on the very first start of a fresh data directory. On an
# existing db-data volume nothing here happens — `make dev-reset` first.
#
# All three roles are created everywhere. The throwaway test database is created
# only when POSTGRES_CREATE_TEST_DB is set, which compose.dev.yaml does and
# compose.yaml does not: production has no `make check-db` to run and no use for
# a second database, and a reviewer with psql should not have to ask what
# timseil_test is. The default is therefore off, so that a forgotten variable
# leaves production clean rather than furnished.
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is not set}"
: "${MIGRATE_DB_PASSWORD:?MIGRATE_DB_PASSWORD is not set — copy .env.example to .env}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is not set — copy .env.example to .env}"
: "${METRICS_DB_PASSWORD:?METRICS_DB_PASSWORD is not set — copy .env.example to .env}"

# The test database gets the same schema treatment as the real one. It exists so
# that `make check-db` can cycle up/down/up without wiping what you were looking
# at in development.
TEST_DB="${POSTGRES_DB}_test"
CREATE_TEST_DB="${POSTGRES_CREATE_TEST_DB:-}"

# --set makes psql substitute the values as quoted literals, so a password with
# a quote in it cannot end the statement early. ON_ERROR_STOP because a role
# that failed to appear must not look like a successful start.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     --set=migrate_pw="$MIGRATE_DB_PASSWORD" \
     --set=app_pw="$APP_DB_PASSWORD" \
     --set=metrics_pw="$METRICS_DB_PASSWORD" \
     --set=maindb="$POSTGRES_DB" <<'SQL'

-- Idempotent so the script can also be applied to a CI cluster (E1), where the
-- entrypoint conventions do not hold.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'timseil_migrate') THEN
        CREATE ROLE timseil_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'timseil_app') THEN
        CREATE ROLE timseil_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
    -- F3. Reads pg_stat_*, writes nothing, owns nothing. INHERIT and not
    -- NOINHERIT, unlike the two above: its whole privilege set arrives through
    -- membership in pg_monitor, and NOINHERIT would mean an exporter that has
    -- the grant and cannot use it without SET ROLE.
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'timseil_metrics') THEN
        CREATE ROLE timseil_metrics LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
    END IF;
END
$$;

-- Set outside the DO block: inside it the psql variables would not be expanded.
-- password_encryption is scram-sha-256 by default in PG 18 and POSTGRES_INITDB_ARGS
-- pins --auth-host to match, so these hashes are SCRAM. check-db verifies it
-- rather than assuming it — an assumption about a default is not a guarantee.
ALTER ROLE timseil_migrate PASSWORD :'migrate_pw';
ALTER ROLE timseil_app     PASSWORD :'app_pw';
ALTER ROLE timseil_metrics PASSWORD :'metrics_pw';

-- The only privilege this role gets, and it is a built-in one rather than a
-- list we maintain. pg_monitor reads the statistics views and the functions
-- behind them; it grants no access to table DATA, which is the property that
-- makes it the right answer here. Granting SELECT on the schema instead would
-- have put the site's rows in reach of a process that only ever needed counters.
GRANT pg_monitor TO timseil_metrics;

-- timseil_migrate owns the schema and does all DDL.
ALTER DATABASE :"maindb" OWNER TO timseil_migrate;
ALTER SCHEMA public OWNER TO timseil_migrate;

-- Nobody connects to this database except the three named roles.
REVOKE ALL ON DATABASE :"maindb" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"maindb" TO timseil_migrate, timseil_app, timseil_metrics;

SQL

if [ -n "$CREATE_TEST_DB" ]; then
    # The throwaway database for make check-db. Same ownership, same rules.
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
         --set=testdb="$TEST_DB" <<'SQL'
CREATE DATABASE :"testdb" OWNER timseil_migrate;
REVOKE ALL ON DATABASE :"testdb" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"testdb" TO timseil_migrate, timseil_app;
SQL

    # The public schema of a freshly created database is owned by the bootstrap
    # superuser, so the ownership transfer has to happen while connected to it.
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$TEST_DB" <<'SQL'
ALTER SCHEMA public OWNER TO timseil_migrate;
SQL

    printf 'timseil: roles timseil_migrate and timseil_app created, test database ready\n'
else
    printf 'timseil: roles timseil_migrate and timseil_app created\n'
fi
