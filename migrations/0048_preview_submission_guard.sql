-- CB-9a-2: run_submissions is a new write target on a preview run, so it joins
-- the tables 0046 already fences. Without this a retired or expired preview
-- session could still record submissions, which is exactly the "cleanup cannot
-- race a pending job into recreating retired preview data" case.
DROP TRIGGER IF EXISTS guard_retired_preview_write ON "run_submissions";
--> statement-breakpoint
CREATE TRIGGER guard_retired_preview_write BEFORE INSERT OR UPDATE ON "run_submissions"
FOR EACH ROW EXECUTE FUNCTION "guard_retired_preview_write"();
