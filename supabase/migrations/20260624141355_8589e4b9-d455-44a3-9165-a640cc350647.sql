
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_active_approved boolean;
  _is_admin boolean;
  _is_supervisor boolean;
  _assigned_to uuid;
  _instance_id uuid;
BEGIN
  SELECT (p.is_active AND p.is_approved) INTO _is_active_approved
  FROM public.profiles p WHERE p.id = _user_id;
  IF NOT COALESCE(_is_active_approved, false) THEN RETURN false; END IF;

  SELECT c.assigned_to, c.instance_id INTO _assigned_to, _instance_id
  FROM public.whatsapp_conversations c WHERE c.id = _conversation_id;
  IF _instance_id IS NULL THEN RETURN false; END IF;

  IF _assigned_to = _user_id THEN RETURN true; END IF;

  _is_admin := public.has_role(_user_id, 'admin'::app_role);
  _is_supervisor := public.has_role(_user_id, 'supervisor'::app_role);

  IF _is_admin OR _is_supervisor THEN
    RETURN public.can_user_see_instance(_user_id, _instance_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agent_instance_access
    WHERE user_id = _user_id AND instance_id = _instance_id
  ) THEN RETURN false; END IF;

  IF _assigned_to IS NULL THEN
    -- Agent só pode acessar conversa não-atribuída se uma regra ativa o inclui explicitamente
    RETURN EXISTS (
      SELECT 1 FROM public.assignment_rules r
      WHERE r.instance_id = _instance_id AND r.is_active = true
        AND (
          (r.rule_type = 'fixed' AND r.fixed_agent_id = _user_id)
          OR (r.rule_type = 'round_robin' AND _user_id = ANY(r.round_robin_agents))
        )
    );
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_view_conversation(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_active_approved boolean;
  _assigned_to uuid;
  _instance_id uuid;
BEGIN
  -- Se já tem acesso de escrita, tem leitura
  IF public.can_access_conversation(_user_id, _conversation_id) THEN
    RETURN true;
  END IF;

  SELECT (p.is_active AND p.is_approved)
    INTO _is_active_approved
  FROM public.profiles p
  WHERE p.id = _user_id;

  IF NOT COALESCE(_is_active_approved, false) THEN
    RETURN false;
  END IF;

  SELECT c.assigned_to, c.instance_id
    INTO _assigned_to, _instance_id
  FROM public.whatsapp_conversations c
  WHERE c.id = _conversation_id;

  IF _instance_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admins/supervisores que enxergam a instância podem ler conversas atribuídas
  IF _assigned_to IS NOT NULL
     AND (public.has_role(_user_id, 'admin'::app_role) OR public.has_role(_user_id, 'supervisor'::app_role))
     AND public.can_user_see_instance(_user_id, _instance_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;
