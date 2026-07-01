
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_first_user boolean;
  _assigned_role app_role;
  _require_approval boolean;
  _is_approved boolean;
  _company_id uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first_user;

  SELECT (value = 'true') INTO _require_approval
  FROM public.project_config
  WHERE key = 'require_account_approval'
  LIMIT 1;
  _require_approval := COALESCE(_require_approval, false);

  IF _is_first_user THEN
    _assigned_role := 'admin';
    _is_approved := true;
  ELSE
    _assigned_role := 'agent';
    _is_approved := NOT _require_approval;
  END IF;

  BEGIN
    _company_id := NULLIF(new.raw_user_meta_data->>'company_id','')::uuid;
  EXCEPTION WHEN others THEN
    _company_id := NULL;
  END;

  INSERT INTO public.profiles (id, full_name, email, is_active, is_approved, company_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    true,
    _is_approved,
    _company_id
  )
  ON CONFLICT (id) DO UPDATE
    SET company_id = COALESCE(public.profiles.company_id, EXCLUDED.company_id),
        full_name  = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        email      = COALESCE(public.profiles.email, EXCLUDED.email);

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (new.id, _assigned_role, _company_id)
  ON CONFLICT (user_id, role) DO UPDATE
    SET company_id = COALESCE(public.user_roles.company_id, EXCLUDED.company_id);

  RETURN new;
END;
$function$;
