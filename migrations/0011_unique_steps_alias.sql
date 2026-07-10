CREATE UNIQUE INDEX IF NOT EXISTS "steps_section_alias_unique" ON "steps" USING btree ("section_id", "alias");
