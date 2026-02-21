-- ============================================================
-- Indoor AR Navigation SaaS — Schema v5 (Complete PRD)
-- ============================================================
-- Run this migration AFTER v4 + fix-rls have been applied.
-- Adds: section metadata, QR anchor support, category system.
-- ============================================================

-- 1. Add description and category columns to sections
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- 2. Add 'qr_anchor' to the node type options
-- The type column is TEXT so we just need to accept the new value.
-- We document that valid types are: normal, entrance, section, qr_anchor

-- 3. Create index on sections.category for filtering
CREATE INDEX IF NOT EXISTS idx_sections_category
  ON public.sections (category);

-- 4. Create index on navigation_nodes.type for QR anchor lookups
CREATE INDEX IF NOT EXISTS idx_nodes_type
  ON public.navigation_nodes (type);

-- 5. Add number_of_floors column to stores (for multi-floor support)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS number_of_floors INT DEFAULT 1;

-- ============================================================
-- Summary of node types:
--   'normal'     — standard walkable node
--   'entrance'   — store entrance (only one per floor)
--   'section'    — destination section node
--   'qr_anchor'  — QR code anchor for position calibration
-- ============================================================
