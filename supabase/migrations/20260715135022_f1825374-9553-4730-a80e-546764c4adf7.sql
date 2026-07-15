
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
  _dest_company uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT public.can_access_conversation(_caller, _conversation_id) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir esta conversa';
  END IF;

  SELECT assigned_to, company_id
    INTO _current_assigned, _conv_company
  FROM public.whatsapp_conversations
  WHERE id = _conversation_id;

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

    -- Destinatário precisa ser da mesma empresa da conversa,
    -- OU super admin com acesso explícito àquela empresa.
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
