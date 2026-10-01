-- Legacy rows remain accessible in All offers and have no asserted festival membership.
ALTER TABLE offers ADD COLUMN discovery jsonb;
ALTER TABLE offers ADD CONSTRAINT discovery_object CHECK (discovery IS NULL OR jsonb_typeof(discovery) = 'object');
CREATE INDEX offers_campaign_season ON offers ((discovery->'campaign'->>'seasonAD')) WHERE withdrawn_at IS NULL;
CREATE INDEX offers_discovery_gin ON offers USING gin (discovery);
CREATE INDEX offers_budget ON offers ((COALESCE(sale_currency, original_currency)), (COALESCE(sale_amount_minor, original_amount_minor))) WHERE withdrawn_at IS NULL;
CREATE TABLE offer_price_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES offers(id),
  source_product_key text,
  currency varchar(3) NOT NULL,
  amount_minor bigint NOT NULL,
  reference_amount_minor bigint,
  observed_at timestamptz NOT NULL
);
CREATE INDEX offer_price_history ON offer_price_observations (offer_id, observed_at);
CREATE FUNCTION observe_offer_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sale_amount_minor IS NOT NULL THEN
    INSERT INTO offer_price_observations (offer_id, source_product_key, currency, amount_minor, reference_amount_minor, observed_at)
    VALUES (NEW.id, NEW.discovery->'product'->>'key', NEW.sale_currency, NEW.sale_amount_minor, NEW.original_amount_minor, NEW.updated_at);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER observe_offer_price AFTER INSERT OR UPDATE OF sale_amount_minor, sale_currency, discovery ON offers FOR EACH ROW EXECUTE FUNCTION observe_offer_price();

CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TABLE offers ADD COLUMN search_document text GENERATED ALWAYS AS (
  coalesce(title, '') || ' ' || coalesce(seller_display_name, '') || ' ' || category || ' ' ||
  coalesce(product_name, '') || ' ' || coalesce(brand_name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(terms, '') || ' ' ||
  coalesce(discovery->'campaign'->>'title', '') || ' ' || coalesce(discovery->'product'->>'model', '') || ' ' ||
  coalesce((discovery->'components')::text, '') || ' ' || coalesce((discovery->'benefits')::text, '')
) STORED;
CREATE INDEX offers_search_words ON offers USING gin (to_tsvector('simple', search_document));
CREATE INDEX offers_search_typos ON offers USING gin (lower(search_document) gin_trgm_ops);
