
UPDATE public.profiles SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE id = '1e9affd3-08eb-485b-b195-715dad29d4f8' AND company_id IS NULL;

UPDATE public.user_roles SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE user_id = '1e9affd3-08eb-485b-b195-715dad29d4f8' AND company_id IS NULL;

UPDATE public.agent_instance_access SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE user_id = '1e9affd3-08eb-485b-b195-715dad29d4f8' AND company_id IS NULL;
