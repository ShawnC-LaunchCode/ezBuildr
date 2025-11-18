-- Migration: Add trace and error fields to runs table
-- Stage 8: Run History UI + Debug Traces + Download Center
-- This adds support for storing execution traces and error messages

-- Add trace field (JSONB) to store node-by-node execution details
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "trace" JSONB;

-- Add error field (TEXT) to store error messages when status is 'error'
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "error" TEXT;
