CREATE TABLE offers (
  id uuid PRIMARY KEY,
  source_id varchar(100) NOT NULL,
  source_offer_key varchar(200) NOT NULL,
  seller_display_name varchar(300) NOT NULL,
  title varchar(300) NOT NULL,
  summary varchar(2000),
  product_name varchar(200),
  brand_name varchar(200),
  category varchar(50) NOT NULL,
  image_url varchar(2048),
  destination_url varchar(2048) NOT NULL,
  original_currency char(3),
  original_amount_minor bigint,
  sale_currency char(3),
  sale_amount_minor bigint,
  discount_percent double precision,
  discount_label varchar(500),
  terms varchar(5000),
  source_published_kind varchar(20),
  source_published_at timestamptz,
  source_published_date date,
  validity_starts_at timestamptz,
  explicit_validity_end_kind varchar(20),
  explicit_validity_end_at timestamptz,
  explicit_validity_end_date date,
  first_discovered_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT offers_source_identity_unique
    UNIQUE (source_id, source_offer_key),
  CONSTRAINT offers_source_id_format
    CHECK (source_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT offers_source_offer_key_present
    CHECK (char_length(btrim(source_offer_key)) BETWEEN 1 AND 200),
  CONSTRAINT offers_seller_present
    CHECK (char_length(btrim(seller_display_name)) BETWEEN 1 AND 300),
  CONSTRAINT offers_title_present
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  CONSTRAINT offers_category_supported
    CHECK (category IN (
      'GENERAL_RETAIL',
      'MOBILE_AND_TABLETS',
      'COMPUTERS_AND_ACCESSORIES',
      'CONSUMER_ELECTRONICS',
      'HOME_APPLIANCES',
      'FASHION_AND_LIFESTYLE',
      'AUTOMOTIVE',
      'TRAVEL',
      'FOOD_AND_DELIVERY',
      'PAYMENTS_AND_FINANCE',
      'OTHER'
    )),
  CONSTRAINT offers_destination_https
    CHECK (destination_url ~ '^https://'),
  CONSTRAINT offers_image_https
    CHECK (image_url IS NULL OR image_url ~ '^https://'),
  CONSTRAINT offers_original_price_complete
    CHECK ((original_currency IS NULL) = (original_amount_minor IS NULL)),
  CONSTRAINT offers_sale_price_complete
    CHECK ((sale_currency IS NULL) = (sale_amount_minor IS NULL)),
  CONSTRAINT offers_original_currency_format
    CHECK (original_currency IS NULL OR original_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT offers_sale_currency_format
    CHECK (sale_currency IS NULL OR sale_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT offers_original_amount_safe
    CHECK (
      original_amount_minor IS NULL OR
      original_amount_minor BETWEEN 0 AND 9007199254740991
    ),
  CONSTRAINT offers_sale_amount_safe
    CHECK (
      sale_amount_minor IS NULL OR
      sale_amount_minor BETWEEN 0 AND 9007199254740991
    ),
  CONSTRAINT offers_price_currencies_match
    CHECK (
      original_currency IS NULL OR
      sale_currency IS NULL OR
      original_currency = sale_currency
    ),
  CONSTRAINT offers_sale_not_above_original
    CHECK (
      original_amount_minor IS NULL OR
      sale_amount_minor IS NULL OR
      sale_amount_minor <= original_amount_minor
    ),
  CONSTRAINT offers_discount_range
    CHECK (
      discount_percent IS NULL OR
      (discount_percent >= 0 AND discount_percent <= 100)
    ),
  CONSTRAINT offers_source_publication_shape
    CHECK (
      (
        source_published_kind IS NULL AND
        source_published_at IS NULL AND
        source_published_date IS NULL
      ) OR (
        source_published_kind = 'INSTANT' AND
        source_published_at IS NOT NULL AND
        source_published_date IS NULL
      ) OR (
        source_published_kind = 'KATHMANDU_DATE' AND
        source_published_at IS NULL AND
        source_published_date IS NOT NULL
      )
    ),
  CONSTRAINT offers_explicit_validity_shape
    CHECK (
      (
        explicit_validity_end_kind IS NULL AND
        explicit_validity_end_at IS NULL AND
        explicit_validity_end_date IS NULL
      ) OR (
        explicit_validity_end_kind = 'INSTANT' AND
        explicit_validity_end_at IS NOT NULL AND
        explicit_validity_end_date IS NULL
      ) OR (
        explicit_validity_end_kind = 'KATHMANDU_DATE' AND
        explicit_validity_end_at IS NULL AND
        explicit_validity_end_date IS NOT NULL
      )
    ),
  CONSTRAINT offers_validity_window
    CHECK (validity_starts_at IS NULL OR validity_starts_at < expires_at),
  CONSTRAINT offers_updated_after_created
    CHECK (updated_at >= created_at),
  CONSTRAINT offers_withdrawn_after_created
    CHECK (withdrawn_at IS NULL OR withdrawn_at >= created_at)
);

CREATE INDEX offers_visible_expiry_idx
  ON offers (expires_at, id)
  WHERE withdrawn_at IS NULL;

CREATE INDEX offers_visible_newest_idx
  ON offers (first_discovered_at DESC, id DESC)
  WHERE withdrawn_at IS NULL;

CREATE INDEX offers_visible_category_idx
  ON offers (category, first_discovered_at DESC, id DESC)
  WHERE withdrawn_at IS NULL;

CREATE INDEX offers_visible_source_idx
  ON offers (source_id, first_discovered_at DESC, id DESC)
  WHERE withdrawn_at IS NULL;

CREATE INDEX offers_visible_discount_idx
  ON offers (discount_percent DESC NULLS LAST, id DESC)
  WHERE withdrawn_at IS NULL;

CREATE INDEX offers_visible_price_idx
  ON offers (sale_currency, sale_amount_minor, id)
  WHERE withdrawn_at IS NULL;
