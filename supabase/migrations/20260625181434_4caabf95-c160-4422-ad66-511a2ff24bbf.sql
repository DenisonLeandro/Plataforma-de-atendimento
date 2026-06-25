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
  IF public.can_access_conversation(_user_id, _conversation_id) THEN
    RETURN true;
  END IF;

  SELECT (p.is_active AND p.is_approved) INTO _is_active_approved
  FROM public.profiles p WHERE p.id = _user_id;
  IF NOT COALESCE(_is_active_approved, false) THEN
    RETURN false;
  END IF;

  SELECT c.assigned_to, c.instance_id INTO _assigned_to, _instance_id
  FROM public.whatsapp_conversations c WHERE c.id = _conversation_id;
  IF _instance_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin/supervisor que enxergam a instância podem ler conversas atribuídas
  IF _assigned_to IS NOT NULL
     AND (public.has_role(_user_id, 'admin'::app_role) OR public.has_role(_user_id, 'supervisor'::app_role))
     AND public.can_user_see_instance(_user_id, _instance_id) THEN
    RETURN true;
  END IF;

  -- NOVO: agente com acesso explícito à instância pode LER todas as conversas
  -- daquela instância (mesmo atribuídas a outros). Escrita continua restrita
  -- por can_access_conversation.
  IF EXISTS (
    SELECT 1 FROM public.agent_instance_access a
    WHERE a.user_id = _user_id AND a.instance_id = _instance_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;