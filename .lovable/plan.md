# Plano: corrigir lentidão da plataforma

## Diagnóstico

O banco é **pequeno** (807 conversas, 8.200 mensagens, 25 MB), mas as queries estão lentas. Investiguei `pg_stat_statements`, índices e RLS. As causas reais são:

### 1. RLS pesado executado linha-a-linha
A policy de leitura em `whatsapp_conversations` (e `whatsapp_messages`) chama `can_view_conversation()` → `can_access_conversation()`. Essa função encadeia vários `EXISTS`, incluindo uma subquery correlacionada sobre `assignment_rules`. Para cada SELECT, o Postgres avalia isso **por linha**, multiplicando o custo. Por isso queries triviais (`select * limit 20`) chegam a **média 1.6s e pico 7.6s**.

### 2. Volume enorme de refetch (~28k chamadas do mesmo SELECT)
`useWhatsAppConversations` dispara **4 queries por refetch** (lista + count exato + unreadCount exato + waitingCount exato). Cada `count: 'exact'` força varredura completa da tabela passando por RLS. Como o hook é remontado em vários componentes e invalidado a cada evento realtime, o efeito é amplificado.

### 3. Compute saturado
`db_health` mostra **memória 72% usada** e **38k rollbacks** acumulados desde o boot, num DB de 25 MB. Indica instância pequena lutando com a carga de RLS + counts repetidos.

### 4. Polling/realtime mal escopados
Toda inserção em `whatsapp_messages` invalida a query de conversas inteira (4 queries) — multiplicado pelos clientes conectados.

## O que vamos mudar

### Etapa 1 — Reescrever as funções de RLS (maior ganho)
Migrar `can_access_conversation` e `can_view_conversation` para versões que:
- Chequem perfil ativo/aprovado uma única vez no início (curto-circuito).
- Substituam a subquery correlacionada em `assignment_rules` por um `NOT EXISTS` simples com índice, ou removam essa cláusula quando o usuário já é admin/supervisor.
- Sejam marcadas `STABLE PARALLEL SAFE` para permitir cache de chamada e execução paralela.

Adicionar índices de suporte:
```sql
CREATE INDEX IF NOT EXISTS idx_assignment_rules_instance_active
  ON public.assignment_rules (instance_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_instance_access_user
  ON public.agent_instance_access (user_id, instance_id);
```

### Etapa 2 — Trocar `count: 'exact'` por contagem planejada
No hook `useWhatsAppConversations`:
- Substituir os três `count: 'exact'` por `count: 'planned'` (header `Prefer: count=planned`) — devolve estimativa do planner em microssegundos. Para uma lista paginada de chat, estimativa é suficiente.
- Consolidar `unreadCount` + `waitingCount` em **uma única RPC** (`get_conversation_counters(filters)`) em vez de duas queries adicionais.

Resultado esperado: cada refetch passa de **4 → 2 queries**, e os counts deixam de varrer a tabela toda.

### Etapa 3 — Reduzir refetch desnecessário
- Aumentar `staleTime` de 30s para 60s e adicionar `gcTime` razoável.
- Debounce do realtime já existe (1.5s) — aumentar para 3s e ignorar evento de `whatsapp_messages` quando a mensagem é da própria página atual (já temos `useWhatsAppMessages` cuidando disso).
- Garantir que o hook só seja montado **uma vez** por página (verificar `NotificationContext`, `useWhatsAppContacts`, etc. que consultam a mesma tabela em paralelo).

### Etapa 4 — Aumentar instância da Lovable Cloud
Memória 72% em DB de 25 MB indica que o tamanho atual não suporta o volume de RLS + conexões (34/60). Recomendo subir uma faixa de instância em **Backend → Advanced settings → Upgrade instance**. Isso, somado às otimizações acima, deve eliminar a lentidão em "transferir", "assumir" e abrir conversa — essas ações disparam refetch da lista inteira.

## Ordem de execução
1. Migração SQL: reescrever funções RLS + criar índices.
2. RPC `get_conversation_counters` + ajuste do hook (`useWhatsAppConversations`) para `count: 'planned'` e RPC consolidada.
3. Ajustar debounce/staleTime do hook.
4. Você sobe a instância pelo painel da Lovable Cloud.

## Detalhes técnicos
- Nenhuma mudança de schema destrutiva, apenas `CREATE OR REPLACE FUNCTION`, novos índices e nova RPC.
- Policies permanecem semanticamente idênticas — mesmas regras de visibilidade.
- Frontend: mudanças confinadas a `src/hooks/whatsapp/useWhatsAppConversations.ts`.
- Sem impacto em dados existentes.

## Métricas de sucesso
- Mean `SELECT whatsapp_conversations LIMIT 20` cair de ~1600ms para < 50ms.
- Ação "assumir/transferir" responder em < 300ms (hoje ~2-3s).
- Memória do DB cair abaixo de 60%.
