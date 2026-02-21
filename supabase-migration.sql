-- ============================================================
-- AR Indoor Navigation Platform — Complete Database Schema
-- ============================================================
-- Single consolidated migration file.
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor).
--
-- Prerequisites:
--   - Fresh Supabase project (or drop existing tables first)
--   - Auth enabled (default in Supabase)
--
-- After running:
--   1. Create admin user via Supabase Auth dashboard
--   2. Run the admin role SQL at the bottom of this file
--   3. Create "floorplans" storage bucket (public)
-- ============================================================

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ADMIN CHECK HELPER (SECURITY DEFINER — bypasses RLS)
-- ============================================================
-- This function breaks the infinite recursion that occurs when
-- RLS policies on the users table reference the users table.
CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = check_user_id AND role = 'admin'
  );
$$;

-- ============================================================
-- 2. USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON users;
CREATE POLICY "Users read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admin read all users" ON users;
CREATE POLICY "Admin read all users" ON users
  FOR SELECT USING (is_admin(auth.uid()));

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
-- 3. STORES
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
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- 4. STORE VERSIONS
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

CREATE POLICY "Public read published versions" ON store_versions
  FOR SELECT USING (is_published = true);

CREATE POLICY "Admin read all versions" ON store_versions
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admin manage versions" ON store_versions
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- 5. FLOORS
-- ============================================================
CREATE TABLE floors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Ground Floor',
  level_number INT NOT NULL DEFAULT 0,
  store_version_id UUID REFERENCES store_versions(id) ON DELETE CASCADE,
  floorplan_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE floors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read floors" ON floors
  FOR SELECT USING (true);

CREATE POLICY "Admin manage floors" ON floors
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- 6. NAVIGATION NODES
-- ============================================================
CREATE TABLE navigation_nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  x FLOAT NOT NULL,
  z FLOAT NOT NULL,
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  walkable BOOLEAN NOT NULL DEFAULT true,
  label TEXT,
  type TEXT NOT NULL DEFAULT 'normal' CHECK (type IN ('normal', 'entrance', 'section')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE navigation_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read nodes" ON navigation_nodes
  FOR SELECT USING (true);

CREATE POLICY "Admin manage nodes" ON navigation_nodes
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- 7. NAVIGATION EDGES
-- ============================================================
CREATE TABLE navigation_edges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_node UUID NOT NULL REFERENCES navigation_nodes(id) ON DELETE CASCADE,
  to_node UUID NOT NULL REFERENCES navigation_nodes(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES floors(id) ON DELETE CASCADE,
  distance FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE navigation_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read edges" ON navigation_edges
  FOR SELECT USING (true);

CREATE POLICY "Admin manage edges" ON navigation_edges
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Auto-calculate edge distance via trigger
CREATE OR REPLACE FUNCTION calculate_edge_distance()
RETURNS TRIGGER AS $$
DECLARE
  from_x FLOAT;
  from_z FLOAT;
  to_x FLOAT;
  to_z FLOAT;
BEGIN
  SELECT x, z INTO from_x, from_z FROM navigation_nodes WHERE id = NEW.from_node;
  SELECT x, z INTO to_x, to_z FROM navigation_nodes WHERE id = NEW.to_node;
  IF from_x IS NOT NULL AND to_x IS NOT NULL THEN
    NEW.distance := sqrt(power(to_x - from_x, 2) + power(to_z - from_z, 2));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_edge_distance ON navigation_edges;
CREATE TRIGGER trg_calc_edge_distance
  BEFORE INSERT OR UPDATE ON navigation_edges
  FOR EACH ROW
  EXECUTE FUNCTION calculate_edge_distance();

-- ============================================================
-- 8. SECTIONS
-- ============================================================
CREATE TABLE sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  node_id UUID NOT NULL REFERENCES navigation_nodes(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES floors(id) ON DELETE CASCADE,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read sections" ON sections
  FOR SELECT USING (true);

CREATE POLICY "Admin manage sections" ON sections
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- 9. PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_store_versions_store_id ON store_versions(store_id);
CREATE INDEX IF NOT EXISTS idx_store_versions_published ON store_versions(store_id, is_published);
CREATE INDEX IF NOT EXISTS idx_floors_store_version ON floors(store_version_id);
CREATE INDEX IF NOT EXISTS idx_nodes_floor ON navigation_nodes(floor_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON navigation_nodes(type);
CREATE INDEX IF NOT EXISTS idx_edges_floor ON navigation_edges(floor_id);
CREATE INDEX IF NOT EXISTS idx_edges_from ON navigation_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_edges_to ON navigation_edges(to_node);
CREATE INDEX IF NOT EXISTS idx_sections_floor ON sections(floor_id);
CREATE INDEX IF NOT EXISTS idx_sections_node ON sections(node_id);

-- ============================================================
-- 10. STORAGE BUCKET POLICIES
-- ============================================================
-- Create the bucket manually: Dashboard > Storage > New Bucket
--   Name: floorplans
--   Public: true
--
-- Then run these policies:

-- INSERT INTO storage.buckets (id, name, public) VALUES ('floorplans', 'floorplans', true);

-- CREATE POLICY "Public read floorplans" ON storage.objects
--   FOR SELECT USING (bucket_id = 'floorplans');

-- CREATE POLICY "Admin upload floorplans" ON storage.objects
--   FOR INSERT WITH CHECK (
--     bucket_id = 'floorplans'
--     AND is_admin(auth.uid())
--   );

-- CREATE POLICY "Admin delete floorplans" ON storage.objects
--   FOR DELETE USING (
--     bucket_id = 'floorplans'
--     AND is_admin(auth.uid())
--   );

-- ============================================================
-- 11. ADMIN ROLE ASSIGNMENT
-- ============================================================
-- After creating the admin user via Supabase Auth Dashboard:
--
--   1. Go to Authentication > Users
--   2. Click "Add User" (or "Invite User")
--   3. Email: Invinciblx777@gmail.com
--   4. Set a strong password
--   5. Check "Auto Confirm"
--
-- Then run this SQL to assign admin role:
--
-- UPDATE users SET role = 'admin'
-- WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'invinciblx777@gmail.com' LIMIT 1
-- );
--
-- Verify:
-- SELECT u.id, au.email, u.role
-- FROM users u
-- JOIN auth.users au ON au.id = u.id
-- WHERE au.email = 'invinciblx777@gmail.com';
