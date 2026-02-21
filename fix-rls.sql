-- Fix for infinite recursion in users table RLS policies
-- The "Admin read all users" policy on users calls is_admin(), which queries the users table, 
-- creating an infinite loop for any SELECT operation unless bypassed correctly by Security Definer.

-- Drop the problematic policy
DROP POLICY IF EXISTS "Admin read all users" ON public.users;

-- Recreate it without recursion, or leave it off if admins use the service_role key to manage users
-- If we MUST let admins read users via client-side, we should use a separate table for roles, 
-- or use JWT claims. Since admin operations are now moving to service_role API routes, 
-- we can just drop the policy entirely, or just allow the users to read their own profile.

-- Let's ensure the profile read policy exists
DROP POLICY IF EXISTS "Users read own profile" ON public.users;
CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING (auth.uid() = id);

-- Make sure the is_admin function is tightly defined
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- By setting search_path and using SECURITY DEFINER, this should run cleanly,
  -- but dropping the user-table policy that calls it is the real fix.
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = check_user_id AND role = 'admin'
  );
$$;
