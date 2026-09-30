ALTER TABLE ingestion_observations
  ADD COLUMN removal_confirmations integer NOT NULL DEFAULT 0
  CHECK (removal_confirmations >= 0);
