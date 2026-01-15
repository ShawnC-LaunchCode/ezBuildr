SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'projects' 
  AND column_name IN ('created_by', 'creator_id', 'owner_id')
ORDER BY column_name;
