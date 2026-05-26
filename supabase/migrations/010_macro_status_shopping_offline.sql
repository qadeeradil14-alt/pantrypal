-- Phase 1 + 2 foundations
-- - Add profile household mapping
-- - Add macro-status model on pantry items
-- - Add shopping_list table with strict household isolation
-- - Add pantry->shopping trigger automation with de-duplication

-- Profiles mirror auth.users and keep a single active household pointer.
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid REFERENCES households(id) ON DELETE SET NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_self_select'
  ) THEN
    CREATE POLICY "profiles_self_select" ON profiles
      FOR SELECT USING (id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_self_upsert'
  ) THEN
    CREATE POLICY "profiles_self_upsert" ON profiles
      FOR INSERT WITH CHECK (id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_self_update'
  ) THEN
    CREATE POLICY "profiles_self_update" ON profiles
      FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- Keep profile household pointer in sync with the latest membership write.
CREATE OR REPLACE FUNCTION sync_profile_household_from_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, household_id)
  VALUES (NEW.user_id, NEW.household_id)
  ON CONFLICT (id)
  DO UPDATE SET
    household_id = EXCLUDED.household_id,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_members_sync_profile ON household_members;
CREATE TRIGGER household_members_sync_profile
  AFTER INSERT OR UPDATE OF household_id ON household_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_household_from_membership();

-- Allow explicit spice rack zone and introduce macro status.
ALTER TABLE items
  DROP CONSTRAINT IF EXISTS items_category_check;

ALTER TABLE items
  ADD CONSTRAINT items_category_check
  CHECK (category IN ('fridge', 'pantry', 'freezer', 'spice_rack'));

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS macro_status text NOT NULL DEFAULT 'in_stock'
  CHECK (macro_status IN ('in_stock', 'running_low', 'out_of_stock'));

-- Keep legacy boolean and macro-status synchronized for backwards compatibility.
CREATE OR REPLACE FUNCTION sync_item_status_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.macro_status IS NULL OR btrim(NEW.macro_status) = '' THEN
      NEW.macro_status := CASE WHEN NEW.is_low THEN 'running_low' ELSE 'in_stock' END;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.macro_status IS DISTINCT FROM OLD.macro_status THEN
      NEW.is_low := NEW.macro_status IN ('running_low', 'out_of_stock');
    ELSIF NEW.is_low IS DISTINCT FROM OLD.is_low THEN
      NEW.macro_status := CASE WHEN NEW.is_low THEN 'running_low' ELSE 'in_stock' END;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_low := NEW.macro_status IN ('running_low', 'out_of_stock');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_sync_status_fields ON items;
CREATE TRIGGER items_sync_status_fields
  BEFORE INSERT OR UPDATE OF is_low, macro_status ON items
  FOR EACH ROW
  EXECUTE FUNCTION sync_item_status_fields();

-- Canonical shopping ledger for low/out pantry items.
CREATE TABLE IF NOT EXISTS shopping_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  source_item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('fridge', 'pantry', 'freezer', 'spice_rack')),
  aisle text,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_household_status
  ON shopping_list(household_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopping_list_source_item
  ON shopping_list(source_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shopping_list_active_name_per_household
  ON shopping_list(household_id, lower(btrim(name)))
  WHERE status = 'active';

ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shopping_list'
      AND policyname = 'shopping_list_read_own_household'
  ) THEN
    CREATE POLICY "shopping_list_read_own_household" ON shopping_list
      FOR SELECT USING (
        household_id IN (
          SELECT household_id FROM household_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shopping_list'
      AND policyname = 'shopping_list_insert_own_household'
  ) THEN
    CREATE POLICY "shopping_list_insert_own_household" ON shopping_list
      FOR INSERT WITH CHECK (
        household_id IN (
          SELECT household_id FROM household_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shopping_list'
      AND policyname = 'shopping_list_update_own_household'
  ) THEN
    CREATE POLICY "shopping_list_update_own_household" ON shopping_list
      FOR UPDATE USING (
        household_id IN (
          SELECT household_id FROM household_members WHERE user_id = auth.uid()
        )
      ) WITH CHECK (
        household_id IN (
          SELECT household_id FROM household_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shopping_list'
      AND policyname = 'shopping_list_delete_own_household'
  ) THEN
    CREATE POLICY "shopping_list_delete_own_household" ON shopping_list
      FOR DELETE USING (
        household_id IN (
          SELECT household_id FROM household_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Keep updated_at current for shopping rows.
DROP TRIGGER IF EXISTS shopping_list_updated_at ON shopping_list;
CREATE TRIGGER shopping_list_updated_at
  BEFORE UPDATE ON shopping_list
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Pantry->shopping automatic propagation.
CREATE OR REPLACE FUNCTION sync_shopping_list_from_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE shopping_list
    SET status = 'archived', completed_at = COALESCE(completed_at, now())
    WHERE status = 'active'
      AND source_item_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.macro_status IN ('running_low', 'out_of_stock') THEN
    INSERT INTO shopping_list (household_id, source_item_id, name, category, status)
    VALUES (NEW.household_id, NEW.id, NEW.name, NEW.category, 'active')
    ON CONFLICT (household_id, (lower(btrim(name))))
    WHERE status = 'active'
    DO UPDATE SET
      source_item_id = EXCLUDED.source_item_id,
      category = EXCLUDED.category,
      updated_at = now();
  ELSE
    UPDATE shopping_list
    SET status = 'completed', completed_at = COALESCE(completed_at, now())
    WHERE status = 'active'
      AND household_id = NEW.household_id
      AND (
        source_item_id = NEW.id
        OR lower(btrim(name)) = lower(btrim(NEW.name))
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_sync_shopping_list_after_change ON items;
CREATE TRIGGER items_sync_shopping_list_after_change
  AFTER INSERT OR UPDATE OF is_low, macro_status, name, category, household_id ON items
  FOR EACH ROW
  EXECUTE FUNCTION sync_shopping_list_from_item();

DROP TRIGGER IF EXISTS items_sync_shopping_list_after_delete ON items;
CREATE TRIGGER items_sync_shopping_list_after_delete
  AFTER DELETE ON items
  FOR EACH ROW
  EXECUTE FUNCTION sync_shopping_list_from_item();

-- Backfill active shopping list from current low items.
INSERT INTO shopping_list (household_id, source_item_id, name, category, status)
SELECT i.household_id, i.id, i.name, i.category, 'active'
FROM items i
WHERE i.is_low = true
ON CONFLICT (household_id, (lower(btrim(name))))
WHERE status = 'active'
DO UPDATE SET
  source_item_id = EXCLUDED.source_item_id,
  category = EXCLUDED.category,
  updated_at = now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shopping_list'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list;
  END IF;
END $$;
