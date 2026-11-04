-- psql dry run: execute this file from this directory so \ir resolves the applied migration.
BEGIN;
\ir P3a_관리수수료_집계.sql
ROLLBACK;
