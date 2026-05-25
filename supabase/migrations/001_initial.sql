-- PantryPal v1 schema

-- households
CREATE TABLE households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- household_members
CREATE TABLE household_members (
  household_id uuid REFERENCES households(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  push_token text,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

-- items
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('fridge', 'pantry', 'freezer')),
  is_low boolean NOT NULL DEFAULT false,
  marked_low_by uuid REFERENCES auth.users(id),
  got_it_by uuid REFERENCES auth.users(id),
  added_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_items_household_low ON items(household_id, is_low);
CREATE INDEX idx_items_household_id ON items(household_id);
CREATE INDEX idx_household_members_user ON household_members(user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- household_members: see only your own memberships
CREATE POLICY "members_own_rows" ON household_members
  FOR ALL USING (user_id = auth.uid());

-- households: see only households you belong to
CREATE POLICY "households_members_only" ON households
  FOR ALL USING (
    id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- items: read/write only your household's items
CREATE POLICY "items_read_own_household" ON items
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "items_write_own_household" ON items
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "items_update_own_household" ON items
  FOR UPDATE USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Allow joining a household via invite code (pre-auth insert)
CREATE POLICY "household_members_join" ON household_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Enable realtime for items table
ALTER PUBLICATION supabase_realtime ADD TABLE items;
