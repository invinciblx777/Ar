-- AR Navigation MVP — Supabase Schema
-- Run this SQL in your Supabase SQL Editor

-- Create sections table
CREATE TABLE IF NOT EXISTS sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  x FLOAT NOT NULL,
  z FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anon key)
CREATE POLICY "Allow public read" ON sections
  FOR SELECT USING (true);

-- Seed data: store sections with x,z coordinates (meters from entrance)
INSERT INTO sections (name, x, z) VALUES
  ('Billing', 0, 8),
  ('Electronics', 6, 4),
  ('Groceries', -5, 6),
  ('Clothing', 4, -3);
