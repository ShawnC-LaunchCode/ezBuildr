-- Quick Test Data Setup for Transform Editor Testing
-- Run this after creating the "test_users" table in DataVault

-- Table should have these columns:
-- - name (text)
-- - email (text)
-- - age (number)
-- - status (text)
-- - department (text)

-- Clear existing data (if any)
-- DELETE FROM test_users;

-- Insert test data with strategic properties:
-- - Mixed case names: "Alice", "bob", "CHARLIE"
-- - Duplicate names with different cases
-- - Null values in various columns
-- - Duplicate emails for dedupe testing

INSERT INTO test_users (name, email, age, status, department) VALUES
  -- Mixed case names
  ('Alice', 'alice@example.com', 30, 'active', 'Sales'),
  ('bob', 'BOB@EXAMPLE.COM', 25, 'active', 'Engineering'),
  ('CHARLIE', 'charlie@example.com', 35, 'inactive', 'Sales'),
  ('Diana', 'diana@example.com', 28, 'active', 'Engineering'),

  -- Null values for testing is_empty, exists, dedupe
  ('Eve', NULL, 30, NULL, 'Sales'),
  ('Frank', 'frank@example.com', 25, 'active', NULL),

  -- Duplicate names (different case) for case-insensitive testing
  ('alice', 'alice2@example.com', 30, 'active', 'Sales'),
  ('Bob', 'bob2@example.com', 35, 'active', 'Engineering'),
  ('ALICE', 'alice3@example.com', 32, 'inactive', 'Sales'),

  -- More nulls for dedupe testing
  ('Grace', NULL, 28, 'active', 'Engineering'),
  ('Henry', NULL, 40, 'active', 'Sales'),

  -- Inactive users for filtering
  ('Ivy', 'ivy@example.com', 29, 'inactive', 'Engineering'),

  -- Duplicate emails for dedupe testing
  ('John', 'shared@example.com', 33, 'active', 'Sales'),
  ('Jane', 'shared@example.com', 27, 'active', 'Sales'),

  -- More data for sorting/pagination tests
  ('Kelly', 'kelly@example.com', 26, 'active', 'Engineering');

-- Verify data
SELECT
  'Total Rows' as metric,
  COUNT(*) as count
FROM test_users

UNION ALL

SELECT
  'Active Users' as metric,
  COUNT(*) as count
FROM test_users
WHERE status = 'active'

UNION ALL

SELECT
  'Users with NULL email' as metric,
  COUNT(*) as count
FROM test_users
WHERE email IS NULL

UNION ALL

SELECT
  'Users with NULL status' as metric,
  COUNT(*) as count
FROM test_users
WHERE status IS NULL

UNION ALL

SELECT
  'Duplicate emails' as metric,
  COUNT(*) as count
FROM test_users
WHERE email = 'shared@example.com';

-- Expected counts:
-- Total Rows: 15
-- Active Users: 11
-- Users with NULL email: 3 (Eve, Grace, Henry)
-- Users with NULL status: 1 (Eve)
-- Duplicate emails: 2 (John, Jane)
