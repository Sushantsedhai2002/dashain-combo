CREATE TABLE ingestion_observations (
  source_id text NOT NULL,
  base_key varchar(190) NOT NULL,
  generation integer NOT NULL CHECK (generation >= 1),
  source_offer_key varchar(200) NOT NULL,
  destination_url text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at timestamptz,
  PRIMARY KEY (source_id, base_key, generation),
  UNIQUE (source_id, source_offer_key),
  CHECK (destination_url LIKE 'https://%')
);

CREATE INDEX ingestion_observations_active_source
  ON ingestion_observations (source_id)
  WHERE withdrawn_at IS NULL;
