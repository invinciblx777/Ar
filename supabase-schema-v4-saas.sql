-- ============================================================
-- AR Navigation v4 — Multi-Store SaaS Migration
-- ============================================================
-- Run this AFTER v2 schema is in place.
-- This REPLACES v3 — drop old v3 tables if they exist.
-- ============================================================

-- ============================================================
-- 0. CLEANUP v3 TABLES (safe if they don't exist)
-- ============================================================
DROP TABLE IF EXISTS store_versions CASCADE;
-- Drop v3 stores if it exists (we recreate with more columns)
DROP TABLE IF EXISTS stores CASCADE;

-- ============================================================
-- 1. USERS (keep from v3 or create fresh)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users read own profile" ON users;
DROP POLICY IF EXISTS "Admin read all users" ON users;

CREATE POLICY "Users read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admin read all users" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Auto-create user profile on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. STORES (with measurement columns)
-- ============================================================
CREATE TABLE stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  length_meters FLOAT NOT NULL DEFAULT 20,
  width_meters FLOAT NOT NULL DEFAULT 15,
  aisle_count INT NOT NULL DEFAULT 4,
  aisle_width FLOAT NOT NULL DEFAULT 1.2,
  corridor_spacing FLOAT NOT NULL DEFAULT 2.0,
  grid_cell_size FLOAT NOT NULL DEFAULT 1.0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read stores" ON stores
  FOR SELECT USING (true);

CREATE POLICY "Admin manage stores" ON stores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 3. STORE VERSIONS
-- ============================================================
CREATE TABLE store_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_draft BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, version_number)
);

ALTER TABLE store_versions ENABLE ROW LEVEL SECURITY;

-- Public can only see published versions (for AR)
CREATE POLICY "Public read published versions" ON store_versions
  FOR SELECT USING (is_published = true);

-- Admin can see all versions
CREATE POLICY "Admin read all versions" ON store_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin manage versions" ON store_versions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 4. FLOORS (now references store_version_id)
-- ============================================================
-- Add store_version_id column if it doesn't exist
ALTER TABLE floors ADD COLUMN IF NOT EXISTS store_version_id UUID REFERENCES store_versions(id) ON DELETE CASCADE;
-- Keep existing columns
ALTER TABLE floors ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE floors ADD COLUMN IF NOT EXISTS floorplan_image_url TEXT;

-- Drop old policies and recreate
DROP POLICY IF EXISTS "Allow public read floors" ON floors;
DROP POLICY IF EXISTS "Admin manage floors" ON floors;

CREATE POLICY "Public read floors" ON floors
  FOR SELECT USING (true);

CREATE POLICY "Admin manage floors" ON floors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 5. NAVIGATION NODES (add type if missing)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'navigation_nodes' AND column_name = 'type'
  ) THEN
    ALTER TABLE navigation_nodes ADD COLUMN type TEXT NOT NULL DEFAULT 'normal';
    ALTER TABLE navigation_nodes ADD CONSTRAINT chk_node_type
      CHECK (type IN ('normal', 'entrance', 'section'));
  END IF;
END $$;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Allow public read nodes" ON navigation_nodes;
DROP POLICY IF EXISTS "Admin manage nodes" ON navigation_nodes;

CREATE POLICY "Public read nodes" ON navigation_nodes
  FOR SELECT USING (true);

CREATE POLICY "Admin manage nodes" ON navigation_nodes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 6. NAVIGATION EDGES (add floor_id if missing)
-- ============================================================
ALTER TABLE navigation_edges ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES floors(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Allow public read edges" ON navigation_edges;
DROP POLICY IF EXISTS "Admin manage edges" ON navigation_edges;

CREATE POLICY "Public read edges" ON navigation_edges
  FOR SELECT USING (true);

CREATE POLICY "Admin manage edges" ON navigation_edges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 7. SECTIONS (add floor_id if missing)
-- ============================================================
ALTER TABLE sections ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES floors(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Allow public read sections" ON sections;
DROP POLICY IF EXISTS "Admin manage sections" ON sections;

CREATE POLICY "Public read sections" ON sections
  FOR SELECT USING (true);

CREATE POLICY "Admin manage sections" ON sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 8. INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_store_versions_store_id ON store_versions(store_id);
CREATE INDEX IF NOT EXISTS idx_store_versions_published ON store_versions(store_id, is_published);
CREATE INDEX IF NOT EXISTS idx_floors_store_version ON floors(store_version_id);
CREATE INDEX IF NOT EXISTS idx_nodes_floor ON navigation_nodes(floor_id);
CREATE INDEX IF NOT EXISTS idx_edges_floor ON navigation_edges(floor_id);
CREATE INDEX IF NOT EXISTS idx_edges_from ON navigation_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_edges_to ON navigation_edges(to_node);
CREATE INDEX IF NOT EXISTS idx_sections_floor ON sections(floor_id);
CREATE INDEX IF NOT EXISTS idx_sections_node ON sections(node_id);

-- ============================================================
-- 9. STORAGE BUCKET (manual step in Supabase Dashboard)
-- ============================================================
-- Create a public bucket named "floorplans" via Supabase Dashboard:
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
