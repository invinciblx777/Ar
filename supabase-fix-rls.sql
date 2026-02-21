-- ============================================================
-- Fix: Infinite recursion in RLS policies
-- ============================================================
-- Problem: "Admin read all users" policy on `users` table checks
-- `users.role = 'admin'`, which triggers the same policy again.
--
-- Solution: Use a SECURITY DEFINER function to bypass RLS when
-- checking admin role. This breaks the recursion cycle.
-- ============================================================

-- 1. Create the is_admin() helper function (SECURITY DEFINER bypasses RLS)
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

-- 2. Fix users table policies
DROP POLICY IF EXISTS "Admin read all users" ON users;
CREATE POLICY "Admin read all users" ON users
  FOR SELECT USING (is_admin(auth.uid()));

-- 3. Fix all other admin policies to use the function too
DROP POLICY IF EXISTS "Admin manage stores" ON stores;
CREATE POLICY "Admin manage stores" ON stores
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage versions" ON store_versions;
CREATE POLICY "Admin manage versions" ON store_versions
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin read all versions" ON store_versions;
CREATE POLICY "Admin read all versions" ON store_versions
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage floors" ON floors;
CREATE POLICY "Admin manage floors" ON floors
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage nodes" ON navigation_nodes;
CREATE POLICY "Admin manage nodes" ON navigation_nodes
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage edges" ON navigation_edges;
CREATE POLICY "Admin manage edges" ON navigation_edges
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage sections" ON sections;
CREATE POLICY "Admin manage sections" ON sections
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
