-- Run with psql against the catalog after both migration sets have been applied.
SELECT source_id, last_scan_at, next_scan_at, consecutive_failures, outcome FROM ingestion_source_health ORDER BY source_id;
SELECT source_id, source_offer_key, reasons, updated_at FROM ingestion_quarantine ORDER BY updated_at DESC;
SELECT category,
  count(*) FILTER (WHERE discovery->>'qualification' = 'QUALIFIED') AS qualified_products,
  count(DISTINCT discovery->'campaign'->>'key') AS campaigns,
  count(*) FILTER (WHERE (discovery->>'lastVerifiedAt')::timestamptz < now() - interval '48 hours') AS stale,
  count(*) FILTER (WHERE discovery->>'availability' = 'IN_STOCK') AS known_in_stock
FROM offers WHERE withdrawn_at IS NULL AND expires_at > now() GROUP BY category ORDER BY category;
SELECT source_id, count(*) AS price_observations FROM offer_price_observations JOIN offers ON offers.id = offer_id GROUP BY source_id;
