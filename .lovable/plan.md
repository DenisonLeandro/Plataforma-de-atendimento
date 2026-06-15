## Diagnóstico

Hoje as regras em `assignment_rules` só atuam no webhook (`evolution-webhook/index.ts` → `applyAutoAssignment`) — ou seja, só atribuem conversas **novas** que chegam após a regra existir. Conversas antigas/da fila continuam com `assigned_to = NULL` e, mesmo na visão da fila, não há nenhum vínculo entre a regra e a Maria Angélica. Resultado: ela não vê nada da instância São Lourenço a menos que algo novo chegue.

Além disso, na última alteração eu restringi demais a função `can_access_conversation` (tirei o acesso do agente à fila). Você quer o contrário: agente continua vendo a fila, mas respeitando as regras.

## O que vou mudar

### 1. Reverter restrição da fila para agentes
Recriar `public.can_access_conversation` permitindo de novo que agentes vejam a fila (`assigned_to IS NULL`), **porém filtrada por regras de atribuição**:

- Admin/supervisor: vêem tudo (sem mudança).
- Agente vê uma conversa quando:
  - ela está atribuída a ele (`assigned_to = auth.uid()`), **ou**
  - ela está sem dono (`assigned_to IS NULL`) **e** uma das condições é verdadeira:
    - não existe regra ativa para a `instance_id` daquela conversa (fila aberta — comportamento padrão), **ou**
    - existe regra ativa cuja segmentação inclui o usuário:
      - `rule_type = 'fixed'` e `fixed_agent_id = auth.uid()`, ou
      - `rule_type = 'round_robin'` e `auth.uid() = ANY(round_robin_agents)`.

Efeito imediato: assim que a Maria Angélica entrar, ela passa a ver toda a fila da instância São Lourenço, sem precisar esperar mensagem nova. Agentes que não estão na regra param de ver a fila daquela instância (continuam vendo a fila das instâncias sem regra e as conversas já atribuídas a eles).

### 2. Reverter UI da sidebar
- `ConversationsSidebar.tsx`: remover o `isAgentOnly` que forçava `assignedTo = user.id` e escondia o pill "Na Fila". Volta ao comportamento anterior — agente vê fila e usa pills normalmente.
- `QuickFilterPills.tsx`: manter o prop `showQueue` (útil), mas o sidebar passa `true` por padrão.

### 3. Sem migração de dados
Nada de backfill de `assigned_to`. As conversas já existentes ficam exatamente como estão; o que muda é só a visibilidade via RLS. Isso evita mexer em histórico e atribuições antigas.

### 4. Webhook
Sem mudança em `applyAutoAssignment` — ele continua atribuindo conversas novas que chegam, conforme já faz hoje.

## Validação

- Logar como Maria → filtro "Na Fila" deve mostrar as conversas não atribuídas da instância São Lourenço (incluindo as que já existem).
- Logar como outro agente sem regra → não deve ver a fila de São Lourenço, mas continua vendo a fila das instâncias sem regra.
- Logar como admin → vê tudo como antes.
- Conversas já atribuídas a outros agentes (ex.: 1ce4…) continuam visíveis só para esses agentes.

## Detalhe técnico da nova função

```sql
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 WHERE has_role(_user_id, 'admin'::app_role)
    UNION
    SELECT 1 WHERE has_role(_user_id, 'supervisor'::app_role)
    UNION
    -- conversa atribuída ao agente
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = _conversation_id AND c.assigned_to = _user_id
    UNION
    -- conversa na fila e respeitando regras de atribuição
    SELECT 1
    FROM whatsapp_conversations c
    LEFT JOIN assignment_rules r
      ON r.instance_id = c.instance_id AND r.is_active = true
    WHERE c.id = _conversation_id
      AND c.assigned_to IS NULL
      AND (
        r.id IS NULL  -- instância sem regra: fila aberta
        OR (r.rule_type = 'fixed' AND r.fixed_agent_id = _user_id)
        OR (r.rule_type = 'round_robin' AND _user_id = ANY(r.round_robin_agents))
      )
  )
$$;
```
