-- cook-up — /admin one-time-code authentication.
--
-- Append-only, per the policy in 0001_init.sql. Kept in D1 rather than KV so
-- there is no new binding to provision and every branch is testable against the
-- same spy harness the rest of src/lib uses.
--
-- Neither table stores anything reversible: only SHA-256 hashes. The single
-- copies of the real code and the real session token live in the email and in
-- the cookie respectively.

-- One row per code issued, never updated in place except to burn it. Keeping
-- the history rather than one row per email is what lets this table also answer
-- the rate-limit question ("how many codes in the last hour") without a second
-- table to keep in step.
CREATE TABLE admin_otp (
  id          INTEGER PRIMARY KEY,
  email       TEXT    NOT NULL,
  code_hash   TEXT    NOT NULL,
  expires_at  TEXT    NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,                             -- set on success AND on lockout
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_admin_otp_email ON admin_otp(email, created_at);

CREATE TABLE admin_session (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_admin_session_expires ON admin_session(expires_at);
