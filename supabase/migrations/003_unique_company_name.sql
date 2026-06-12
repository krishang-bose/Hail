-- 003_unique_company_name.sql
-- Must run AFTER deduplicating any existing rows.
-- Step 1: Remove duplicate companies (keep newest)
DELETE FROM companies
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM companies
  ORDER BY name, created_at DESC
);

-- Step 2: Add unique constraint so upsert/check-then-insert works correctly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_name_key'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_name_key UNIQUE (name);
  END IF;
END;
$$;
