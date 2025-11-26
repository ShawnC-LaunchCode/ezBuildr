-- Migration: Sync createdBy field from creatorId for backward compatibility
-- Issue: Projects created before Stage 24 have createdBy=null, causing access errors
-- Fix: Copy creatorId to createdBy for all projects where createdBy is null

UPDATE projects
SET created_by = creator_id
WHERE created_by IS NULL AND creator_id IS NOT NULL;
