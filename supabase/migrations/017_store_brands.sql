CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE store_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  aliases text[] NOT NULL DEFAULT '{}',
  domain text,
  logo_url text,
  priority integer NOT NULL DEFAULT 0,
  search_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_store_brand_search_text()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_text := lower(concat_ws(' ', NEW.name, array_to_string(NEW.aliases, ' ')));
  RETURN NEW;
END;
$$;

CREATE TRIGGER store_brands_search_text
  BEFORE INSERT OR UPDATE ON store_brands
  FOR EACH ROW
  EXECUTE FUNCTION set_store_brand_search_text();

CREATE INDEX idx_store_brands_search ON store_brands USING gin (search_text gin_trgm_ops);
CREATE INDEX idx_store_brands_priority ON store_brands (priority DESC, name);

ALTER TABLE store_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_brands_read" ON store_brands
  FOR SELECT USING (true);

ALTER TABLE stores ADD COLUMN store_brand_id uuid REFERENCES store_brands(id) ON DELETE SET NULL;
ALTER TABLE stores ADD COLUMN brand_domain text;
ALTER TABLE stores ADD COLUMN logo_url text;

INSERT INTO store_brands (name, aliases, domain, logo_url, priority, search_text) VALUES
  ('Walmart', ARRAY['Supercenter', 'Walmart Supercenter'], 'walmart.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Walmart_logo_%282025%29.svg/960px-Walmart_logo_%282025%29.svg.png', 100, 'walmart supercenter walmart supercenter'),
  ('Sam''s Club', ARRAY['Sams Club', 'Sam Club'], 'samsclub.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Sam%27s_Club_Logo_2020.svg/960px-Sam%27s_Club_Logo_2020.svg.png', 95, 'sam''s club sams club sam club'),
  ('Costco', ARRAY['Costco Wholesale'], 'costco.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Costco_Wholesale_logo_2010-10-26.svg/960px-Costco_Wholesale_logo_2010-10-26.svg.png', 95, 'costco costco wholesale'),
  ('Kroger', ARRAY[]::text[], 'kroger.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Kroger_logo_%281961-2019%29.svg/960px-Kroger_logo_%281961-2019%29.svg.png', 90, 'kroger'),
  ('Food Lion', ARRAY[]::text[], 'foodlion.com', 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Food_lion.png', 90, 'food lion'),
  ('Publix', ARRAY[]::text[], 'publix.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Publix_Logo.svg/960px-Publix_Logo.svg.png', 90, 'publix'),
  ('Target', ARRAY[]::text[], 'target.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Target_logo.svg/960px-Target_logo.svg.png', 90, 'target'),
  ('ALDI', ARRAY['Aldi'], 'aldi.us', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Aldi_S%C3%BCd_2017_logo.svg/960px-Aldi_S%C3%BCd_2017_logo.svg.png', 85, 'aldi'),
  ('Whole Foods Market', ARRAY['Whole Foods'], 'wholefoodsmarket.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Whole_Foods_Market_201x_logo.svg/960px-Whole_Foods_Market_201x_logo.svg.png', 85, 'whole foods market whole foods'),
  ('Trader Joe''s', ARRAY['Trader Joes'], 'traderjoes.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Trader_Joes_Logo.svg/960px-Trader_Joes_Logo.svg.png', 85, 'trader joe''s trader joes'),
  ('H-E-B', ARRAY['HEB', 'H E B'], 'heb.com', NULL, 80, 'h-e-b heb h e b'),
  ('Safeway', ARRAY[]::text[], 'safeway.com', NULL, 80, 'safeway'),
  ('Meijer', ARRAY[]::text[], 'meijer.com', NULL, 80, 'meijer'),
  ('Giant Food', ARRAY['Giant'], 'giantfood.com', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Giant_Food_2008_logo.svg/960px-Giant_Food_2008_logo.svg.png', 75, 'giant food giant'),
  ('Stop & Shop', ARRAY['Stop and Shop'], 'stopandshop.com', NULL, 75, 'stop and shop stop shop'),
  ('Wegmans', ARRAY[]::text[], 'wegmans.com', NULL, 70, 'wegmans'),
  ('Lidl', ARRAY[]::text[], 'lidl.com', NULL, 70, 'lidl'),
  ('Dollar General', ARRAY[]::text[], 'dollargeneral.com', NULL, 65, 'dollar general'),
  ('Family Dollar', ARRAY[]::text[], 'familydollar.com', NULL, 65, 'family dollar'),
  ('Dollar Tree', ARRAY[]::text[], 'dollartree.com', NULL, 65, 'dollar tree');
