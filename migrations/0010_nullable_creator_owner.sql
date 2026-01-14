-- Migration to make workflows.creator_id and owner_id nullable and set ON DELETE SET NULL
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_creator_id_users_id_fk;
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_owner_id_users_id_fk;
ALTER TABLE workflows ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE workflows ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE workflows ADD CONSTRAINT workflows_creator_id_users_id_fk FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workflows ADD CONSTRAINT workflows_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
