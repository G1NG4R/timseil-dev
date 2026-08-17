-- Privileges, and they have to come first.
--
-- ALTER DEFAULT PRIVILEGES only affects objects created AFTER it runs. Put this
-- anywhere but at the front and every table above it is invisible to the app
-- role — a failure that shows up as a permission error in phase C, far from its
-- cause. Handbook ch. 10, "Zwei Datenbankrollen statt einer"; ADR 0011.
--
-- The roles themselves are NOT created here. They are cluster-wide objects that
-- outlive any schema, and DROP ROLE fails while a single grant still refers to
-- them — which would turn the second up/down cycle red. They come from
-- ops/postgres/initdb/10-roles.sh instead. If timseil_app does not exist this
-- migration fails immediately, and that is the error message we want.

-- +goose Up

-- PUBLIC can create objects in the public schema by default on a freshly
-- initialised cluster below PG 15, and can always see the schema. Neither is
-- wanted: the only two roles that touch this database are named.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO timseil_app;

-- No FOR ROLE clause on purpose: without it these defaults attach to the role
-- executing the statement, which is timseil_migrate — exactly the role that
-- creates every table below. Spelling out FOR ROLE would need a superuser.
--
-- DML only. timseil_app gets no TRUNCATE and no REFERENCES, and it never gets
-- DDL: an SQL injection in the API must not be able to drop a table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO timseil_app;

-- Identity columns own their sequence, so this grants nothing today. It is here
-- so that the day someone writes a plain sequence, the app role is not silently
-- locked out of it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO timseil_app;

-- +goose Down

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE USAGE, SELECT ON SEQUENCES FROM timseil_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM timseil_app;

REVOKE USAGE ON SCHEMA public FROM timseil_app;

-- Restores what initdb left behind. Not a DROP ROLE — see the header.
GRANT USAGE ON SCHEMA public TO PUBLIC;
