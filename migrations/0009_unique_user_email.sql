-- Custom SQL migration file, put your code below! --

-- 1. De-duplicate existing rows (keep the oldest account for each email)
DELETE FROM users 
WHERE id IN (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at ASC) as row_num
    FROM users
  ) t
  WHERE t.row_num > 1
);

--> statement-breakpoint

-- 2. Drop the old non-unique index
DROP INDEX IF EXISTS users_email_idx;

--> statement-breakpoint

-- 3. Create the unique index
CREATE UNIQUE INDEX users_email_idx ON users(email);
