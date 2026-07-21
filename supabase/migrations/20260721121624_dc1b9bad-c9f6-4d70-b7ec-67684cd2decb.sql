
CREATE OR REPLACE FUNCTION public._diag_upsert_contact(_uid uuid, _instance_id uuid, _phone text, _name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb := '{}'::jsonb;
  _sqlstate text;
  _sqlerrm text;
  _company uuid;
  _my_company uuid;
  _see_instance boolean;
  _profile_ok boolean;
  _contact_id uuid;
  _conv_id uuid;
  _can_view boolean;
BEGIN
  -- Avalia sub-predicados como o próprio usuário (SECURITY DEFINER com auth.uid override via jwt claim)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);

  SELECT company_id INTO _company FROM public.whatsapp_instances WHERE id = _instance_id;
  SELECT company_id INTO _my_company FROM public.profiles WHERE id = _uid;
  SELECT (is_active AND is_approved) INTO _profile_ok FROM public.profiles WHERE id = _uid;
  _see_instance := public.can_user_see_instance(_uid, _instance_id);

  SELECT id INTO _contact_id FROM public.whatsapp_contacts
   WHERE instance_id = _instance_id AND phone_number = _phone;
  SELECT id INTO _conv_id FROM public.whatsapp_conversations
   WHERE contact_id = _contact_id LIMIT 1;
  _can_view := public.can_view_conversation(_uid, _conv_id);

  _result := jsonb_build_object(
    'uid', _uid,
    'auth_uid', auth.uid(),
    'instance_company', _company,
    'my_company', _my_company,
    'profile_active_approved', _profile_ok,
    'can_user_see_instance', _see_instance,
    'existing_contact_id', _contact_id,
    'existing_conv_id', _conv_id,
    'can_view_conversation', _can_view
  );

  BEGIN
    INSERT INTO public.whatsapp_contacts (instance_id, phone_number, name)
    VALUES (_instance_id, _phone, _name)
    ON CONFLICT (instance_id, phone_number) DO UPDATE SET name = EXCLUDED.name;
    _result := _result || jsonb_build_object('upsert_ok', true);
    -- rollback effect
    RAISE EXCEPTION 'ROLLBACK_DIAG';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE, _sqlerrm = MESSAGE_TEXT;
      _result := _result || jsonb_build_object('sqlstate', _sqlstate, 'sqlerrm', _sqlerrm);
  END;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public._diag_upsert_contact(uuid,uuid,text,text) FROM PUBLIC;
