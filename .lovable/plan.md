## Problema

Agentes hoje conseguem ver tudo: as conversas atribuídas a eles **e também** as não atribuídas (fila). A regra desejada é: agente só vê o que está atribuído a ele. Admin e supervisor continuam vendo tudo.

A causa está na função `public.can_access_conversation`, usada pelas policies de SELECT/UPDATE da tabela `whatsapp_conversations`. Ela inclui um ramo que libera qualquer conversa com `assigned_to IS NULL`, ou seja, libera a fila inteira para qualquer usuário autenticado (inclusive agentes).

## O que mudar

### 1. Banco — nova migration
Recriar `public.can_access_conversation` removendo o ramo da fila:

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
    SELECT 1 FROM whatsapp_conversations
    WHERE id = _conversation_id AND assigned_to = _user_id
  )
$$;
```

Resultado: agente passa a ver apenas conversas onde `assigned_to = auth.uid()`. Admin/supervisor continuam vendo tudo (inclusive a fila), pois a função retorna true por role antes mesmo de consultar `assigned_to`.

### 2. Frontend — `ConversationsSidebar.tsx`
- Esconder o pill de filtro "Fila" para quem não é admin/supervisor (agente não tem mais acesso à fila, então não faz sentido oferecer o filtro).
- Para agentes, forçar `assignedTo = user.id` em todas as queries por padrão, garantindo consistência com a nova policy e evitando queries vazias confusas.
- Manter "Em Aberto" do admin como está (active + reopened).

### 3. Validação
- Logar como agente → conferir que a sidebar mostra apenas conversas atribuídas a ele, em todos os filtros (Em Aberto, Resolvidas, etc).
- Logar como admin → conferir que continua vendo a conversa do Denison Leandro e demais em andamento.
- Tentar abrir via URL direta uma conversa não atribuída como agente → deve retornar vazio (bloqueado pela RLS).

## Impactos colaterais

- O fluxo de "Assumir da fila" deixa de existir para agentes. A distribuição passa a ser responsabilidade de admin/supervisor (manual ou via `assignment_rules`). Se mais tarde você quiser reabrir a fila para os agentes verem mas não responderem, é só adicionar de volta o ramo `assigned_to IS NULL` na função.
- Nenhuma outra tabela precisa mudar; `whatsapp_messages` e afins já dependem do acesso à conversa.
