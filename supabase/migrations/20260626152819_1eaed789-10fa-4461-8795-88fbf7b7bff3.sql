ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
UPDATE public.profiles SET display_name = 'Inês' WHERE id = 'd08bec96-bbea-4076-8215-9b644d967f4f';