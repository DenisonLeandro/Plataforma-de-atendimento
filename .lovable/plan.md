## Plano — Deixar a plataforma ágil (Desenvol e demais empresas)

### Diagnóstico (medido nos logs)

Ranking dos gargalos por tempo total consumido (últimos 7 dias):

1. **Lista de conversas** — 23.522 chamadas × ~3,1 s = **73.000 s totais**. Consulta usa `count: 'exact'`, que força PostgREST a rodar um `SELECT count(*)` extra sobre todas as conversas da empresa aplicando RLS. Para Desenvol (902 conversas) + demais (2.454 e 982), o custo é multiplicado por cada pageview.
2. **Notificações globais** — polling a cada 30 s de `whatsapp_conversations?unread_count.neq.0` **sem filtro por empresa**. Cada aba autenticada varre conversas de todas as empresas via RLS. ~5.700 execuções, 447 s totais.
3. **Busca de contatos** — `ILIKE '%termo%'` em nome/telefone. Índices trigram existem, mas 311 s totais em 77 chamadas: consultas usam `.or()` que a versão atual do PostgREST não consegue converter em plano com trigram; virou seq scan.
4. Busca em `whatsapp_messages.content` (68 s / 9 chamadas) — full scan em toda a tabela.

### Correções

**A. Frontend — remover `count: 'exact'` no listagem de conversas**
`src/hooks/whatsapp/useWhatsAppConversations.ts` já chama `get_conversation_counters` (RPC) para pegar total/unread/waiting. Trocar a query paginada para `select(..., { count: 'estimated', head: false })` e usar apenas o `total_count` da RPC como fonte de verdade. Isso remove o `pgrst_source_count` de 3 s por request.

**B. Frontend — escopar polling de notificação por empresa**
`src/contexts/NotificationContext.tsx`: adicionar `.eq('company_id', companyId)` (via `useCompanyContext`) e aumentar `refetchInterval` para 60 s. O Realtime já cobre eventos novos em tempo real; o poll é fallback.

**C. Banco — índice de conversas abertas por empresa**
```sql
CREATE INDEX idx_conv_open_company_lastmsg
ON public.whatsapp_conversations (company_id, last_message_at DESC NULLS LAST)
WHERE status NOT IN ('closed','archived');
```
Atende os filtros "Abertos" e "Aguardando" (95 % das aberturas de tela).

**D. Banco — índice para preview de mensagens (busca textual)**
```sql
CREATE INDEX idx_conv_preview_trgm
ON public.whatsapp_conversations USING gin (last_message_preview gin_trgm_ops);
```

**E. Frontend — busca de contatos em duas queries independentes**
Substituir o `.or('name.ilike…,phone_number.ilike…')` por duas consultas paralelas (`name.ilike` + `phone_number.ilike`) e unir os IDs no cliente. PostgREST consegue usar os índices trigram existentes quando não há OR.

**F. Banco — índice para busca full-text em mensagens**
```sql
CREATE INDEX idx_messages_content_trgm
ON public.whatsapp_messages USING gin (content gin_trgm_ops);
```

### Escopo
Sem mudar RLS nem regras de negócio. Só otimização de queries, hooks e índices.

### Ordem de execução
1. Migração com índices C, D, F.
2. Ajuste `useWhatsAppConversations.ts` (A) e busca de contatos (E).
3. Ajuste `NotificationContext.tsx` (B).

### Impacto esperado
Lista de conversas cai de ~3 s para <300 ms; polling de notificação cai ~10× em custo; busca de contato/mensagem passa a usar índice.
