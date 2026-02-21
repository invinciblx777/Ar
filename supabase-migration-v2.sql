-- ============================================================
-- AR Indoor Navigation Platform — PRD v2 Migration
-- ============================================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- to add the missing fields and node types requested in PRD v2.
-- ============================================================

-- 1. Extend the 'navigation_nodes' table 'type' constraint to include 'qr_anchor'
ALTER TABLE navigation_nodes 
  DROP CONSTRAINT IF EXISTS navigation_nodes_type_check;

ALTER TABLE navigation_nodes 
  ADD CONSTRAINT navigation_nodes_type_check 
  CHECK (type IN ('normal', 'entrance', 'section', 'qr_anchor'));

-- 2. Add 'category' and 'description' to the 'sections' table
ALTER TABLE sections 
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Done!
