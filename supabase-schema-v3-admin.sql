-- AR Navigation v3 — Admin Map Builder Migration
-- Run this AFTER v2 schema is already in place.
-- This adds: stores, users, floor plan support, node types, admin RLS.

-- ============================================================
-- 1. STORES
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read stores" ON stores FOR SELECT USING (true);

-- ============================================================
-- 2. USERS (linked to auth.users for role-based access)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin read all users" ON users FOR SELECT
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- Auto-create user profile on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 3. ALTER FLOORS — add store_id and floorplan_image_url
-- ============================================================
ALTER TABLE floors ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE floors ADD COLUMN IF NOT EXISTS floorplan_image_url TEXT;

-- ============================================================
-- 4. ALTER NAVIGATION_NODES — add type column
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'navigation_nodes' AND column_name = 'type'
  ) THEN
    ALTER TABLE navigation_nodes ADD COLUMN type TEXT NOT NULL DEFAULT 'normal';
    ALTER TABLE navigation_nodes ADD CONSTRAINT chk_node_type CHECK (type IN ('normal', 'entrance', 'section'));
  END IF;
END $$;

-- ============================================================
-- 5. ALTER NAVIGATION_EDGES — add floor_id
-- ============================================================
ALTER TABLE navigation_edges ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES floors(id) ON DELETE CASCADE;

-- ============================================================
-- 6. ALTER SECTIONS — add floor_id
-- ============================================================
ALTER TABLE sections ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES floors(id) ON DELETE CASCADE;

-- ============================================================
-- 7. ADMIN WRITE POLICIES
-- ============================================================

-- Stores
CREATE POLICY "Admin manage stores" ON stores FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Floors
CREATE POLICY "Admin manage floors" ON floors FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Navigation Nodes
CREATE POLICY "Admin manage nodes" ON navigation_nodes FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Navigation Edges
CREATE POLICY "Admin manage edges" ON navigation_edges FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Sections
CREATE POLICY "Admin manage sections" ON sections FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 8. BACKFILL EXISTING DATA
-- ============================================================

-- Set type for existing entrance node
UPDATE navigation_nodes SET type = 'entrance' WHERE label = 'Entrance';

-- Set type for existing section nodes
UPDATE navigation_nodes SET type = 'section'
WHERE id IN (SELECT node_id FROM sections);

-- Backfill floor_id on edges from their from_node
UPDATE navigation_edges SET floor_id = n.floor_id
FROM navigation_nodes n
WHERE navigation_edges.from_node = n.id
  AND navigation_edges.floor_id IS NULL;

-- Backfill floor_id on sections from their node_id
UPDATE sections SET floor_id = n.floor_id
FROM navigation_nodes n
WHERE sections.node_id = n.id
  AND sections.floor_id IS NULL;

-- ============================================================
-- 9. STORAGE BUCKET (run via Supabase Dashboard or API)
-- ============================================================
-- Create a public bucket named "floorplans" via the Supabase Dashboard:
--   Storage > New Bucket > Name: floorplans, Public: true
--
-- Then add these storage policies:
--
-- Public read:
--   CREATE POLICY "Public read floorplans" ON storage.objects
--     FOR SELECT USING (bucket_id = 'floorplans');
--
-- Admin upload:
--   CREATE POLICY "Admin upload floorplans" ON storage.objects
--     FOR INSERT WITH CHECK (
--       bucket_id = 'floorplans'
--       AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
--     );
--
-- Admin delete:
--   CREATE POLICY "Admin delete floorplans" ON storage.objects
--     FOR DELETE USING (
--       bucket_id = 'floorplans'
--       AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
--     );
