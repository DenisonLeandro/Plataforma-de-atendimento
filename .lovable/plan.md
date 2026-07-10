
## Problema

Na instância "Piscinas Ibiporã" o rodapé mostra **95 conversas**, mas ao avançar as páginas ficam vazias. Causa raiz: contador e listagem usam critérios de visibilidade diferentes.

- Listagem passa pela policy RLS `Users can view accessible conversations`, que usa `can_view_conversation(uid, id)` (checa atribuição, acesso à instância e regras de fila).
- Contador `get_conversation_counters` usa apenas `can_user_see_instance(uid, instance_id)` + `company_id`.

A RPC conta conversas que a RLS depois esconde. Isso também infla os badges de "não lidas" e "aguardando".

## Correção

Redefinir a RPC `public.get_conversation_counters` para usar exatamente a mesma função da RLS (`can_view_conversation`), garantindo que contador = número real de linhas visíveis.

### Migração SQL

```sql
CREATE OR REPLACE FUNCTION public.get_conversation_counters(
  _instance_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _status_in text[] DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false
) RETURNS TABLE(unread_count bigint, waiting_count bigint, total_count bigint)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE c.unread_count > 0
        AND (c.status IS NULL OR c.status NOT IN ('closed','archived'))
    )::bigint,
    COUNT(*) FILTER (
      WHERE c.last_message_is_from_me = false
        AND (c.status IS NULL OR c.status NOT IN ('closed','archived'))
    )::bigint,
    COUNT(*)::bigint
  FROM public.whatsapp_conversations c
  WHERE public.can_view_conversation(auth.uid(), c.id)
    AND (_instance_id IS NULL OR c.instance_id = _instance_id)
    AND (_status IS NULL OR c.status = _status)
    AND (_status_in IS NULL OR c.status = ANY(_status_in))
    AND (_assigned_to IS NULL OR c.assigned_to = _assigned_to)
    AND (NOT _unassigned OR c.assigned_to IS NULL);
$$;
```

Observações técnicas:
- Removemos `is_super_admin`/`get_user_company_id` porque `can_view_conversation` já cobre esses casos.
- Mantemos `SECURITY INVOKER` (padrão) para respeitar o `auth.uid()` do chamador — a policy é a mesma que o `SELECT` usa, então zero divergência.
- Assinatura e retorno da função **não mudam**, então o front (`useWhatsAppConversations.ts`) não precisa ser tocado.

## Validação

1. Antes: `SELECT * FROM get_conversation_counters(_instance_id => '<piscinas>');` retorna 95.
2. Após migração: mesma chamada deve retornar exatamente o mesmo número que `SELECT count(*) FROM whatsapp_conversations WHERE instance_id = '<piscinas>'` executado pelo usuário do Leonardo (via RLS).
3. UI: rodapé, badge "Não lidas" e "Aguardando" batem com o número real de linhas paginadas — última página não fica vazia.

## Fora de escopo

- Não vamos mexer em `can_view_conversation` nem em `can_user_see_instance` — a lógica de acesso permanece igual.
- Sem mudanças de frontend.
