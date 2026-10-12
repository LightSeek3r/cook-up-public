-- cook-up — bind each /admin code to the browser that asked for it, and
-- budget issuance per client IP.
--
-- Append-only, per the policy in 0001_init.sql. Both columns hold SHA-256
-- digests, never the raw value: binding_hash is the digest of a random nonce
-- kept in an HttpOnly cookie, ip_hash a digest of CF-Connecting-IP keyed with a
-- Worker secret. Rows from before this migration have neither, so they can no
-- longer be verified; they are at most ten minutes from expiry anyway.
--
-- No index: the table only ever holds a day of codes for allowlisted
-- addresses, and every extra index would add a row written per code issued.

ALTER TABLE admin_otp ADD COLUMN binding_hash TEXT;
ALTER TABLE admin_otp ADD COLUMN ip_hash TEXT;
