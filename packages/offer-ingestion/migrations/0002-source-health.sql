CREATE TABLE ingestion_source_health (
  source_id text PRIMARY KEY,
  last_scan_at timestamptz NOT NULL,
  next_scan_at timestamptz NOT NULL,
  consecutive_failures integer NOT NULL DEFAULT 0,
  outcome jsonb NOT NULL
);
CREATE TABLE ingestion_quarantine (
  source_id text NOT NULL,
  source_offer_key text NOT NULL,
  reasons jsonb NOT NULL,
  candidate jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, source_offer_key)
);
