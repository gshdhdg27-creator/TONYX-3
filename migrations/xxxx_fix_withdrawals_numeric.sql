-- migrations/xxxx_fix_withdrawals_numeric.sql

ALTER TABLE withdrawals
  ALTER COLUMN amount TYPE numeric(18,8) USING amount::numeric;

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS fee numeric(18,8) NOT NULL DEFAULT '0';

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS amount_to_send numeric(18,8) NOT NULL DEFAULT '0';

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(64);

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS tx_hash varchar(128);

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

-- уникальный индекс для идемпотентности — без него дубли не отловятся
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_idempotency_key_idx
  ON withdrawals (idempotency_key);
