-- psql dry run: execute this file from this directory so \ir resolves the applied migration.
BEGIN;
\ir P3b_배정_S하위_후보.sql
ROLLBACK;
