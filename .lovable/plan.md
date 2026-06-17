## Correções de performance no frontend (migração já aplicada)

A migração com índices e RLS otimizada já rodou. Falta o passo frontend, que é o **maior** ganho.

### 1. `src/hooks/whatsapp/useWhatsAppConversations.ts`
Hoje o hook faz isto a cada refetch:
- Busca **todas** as conversas (não só as 20 paginadas) — query "SELECT id"
- Busca **todas as mensagens** dessas conversas para descobrir quem mandou a última e contar quem está esperando resposta

Isso bate exatamente na query mais cara do banco (`whatsapp_messages` ordenada por timestamp, 28k chamadas × 877ms = 25.000s de DB).

**Fix:** a tabela `whatsapp_conversations` já tem a coluna `last_message_is_from_me`. Vou:
- Remover o fetch de todas as mensagens.
- Usar `conv.last_message_is_from_me` direto.
- Trocar `waitingCount` por uma única `count(*)` com filtro `last_message_is_from_me = false`.
- Adicionar `staleTime: 30000` e `refetchOnWindowFocus: false` no `useQuery`.

### 2. `src/contexts/AuthContext.tsx`
O log mostra `Loading user data for: ...` rodando 3-4× seguidas para o mesmo usuário. Vou:
- Guardar `lastLoadedUserIdRef` para ignorar chamadas duplicadas do mesmo userId em <2s.
- Remover o `console.log` de "Current auth state" em cada render (ruído).

### Fora de escopo
- Nada de RLS, regras de atribuição, Evolution API, UI, aprovação de contas.

### Resultado esperado
- Listagem de conversas: de ~1s para <100ms.
- Erro `Timed out acquiring connection from connection pool` deve sumir.
- Sem mudança de comportamento visível.
