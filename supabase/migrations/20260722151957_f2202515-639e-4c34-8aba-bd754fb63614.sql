CREATE OR REPLACE FUNCTION public.assign_conversation(_conversation_id uuid, _assigned_to uuid, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _current_assigned uuid;
  _conv_company uuid;
  _conv_instance uuid;
  _dest_company uuid;
  _caller_active_approved boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT (p.is_active AND p.is_approved) INTO _caller_active_approved
  FROM public.profiles p WHERE p.id = _caller;
  IF NOT COALESCE(_caller_active_approved, false) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir esta conversa';
  END IF;

  SELECT assigned_to, company_id, instance_id
    INTO _current_assigned, _conv_company, _conv_instance
  FROM public.whatsapp_conversations
  WHERE id = _conversation_id;

  IF _conv_instance IS NULL THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  -- Autorizado se: super admin com acesso à empresa da conversa OU vê a instância
  IF NOT (
    public.super_admin_can_write_company(_caller, _conv_company)
    OR public.can_user_see_instance(_caller, _conv_instance)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir esta conversa';
  END IF;

  IF _assigned_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = _assigned_to
        AND p.is_active = true
        AND p.is_approved = true
        AND ur.role IN ('admin', 'supervisor', 'agent', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Atendente inválido';
    END IF;

    SELECT company_id INTO _dest_company
    FROM public.profiles WHERE id = _assigned_to;

    IF _dest_company IS DISTINCT FROM _conv_company
       AND NOT public.super_admin_can_write_company(_assigned_to, _conv_company) THEN
      RAISE EXCEPTION 'Atendente de outra empresa não permitido';
    END IF;
  END IF;

  UPDATE public.whatsapp_conversations
  SET assigned_to = _assigned_to,
      updated_at = now()
  WHERE id = _conversation_id;

  INSERT INTO public.conversation_assignments
    (conversation_id, assigned_from, assigned_to, assigned_by, reason)
  VALUES
    (_conversation_id, _current_assigned, COALESCE(_assigned_to, _caller), _caller, _reason);
END;
$function$;