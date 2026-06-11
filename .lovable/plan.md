## Correção do realtime de reabertura

### 1. `supabase/functions/evolution-webhook/index.ts` (linha ~849)
Trocar `updateData.status = 'open'` por `updateData.status = 'active'` (convenção do projeto, mesma usada por `reopenMutation` e pelo filtro "Em Aberto").

### 2. `src/hooks/whatsapp/useWhatsAppConversations.ts` (useEffect em ~200-215)
Adicionar segundo `.on('postgres_changes', ...)` no mesmo canal escutando INSERT em `whatsapp_messages` que também chama `queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] })`. Garante refresh <1s mesmo se o UPDATE da conversa chegar atrasado.

### 3. Redeploy da edge function `evolution-webhook`.

### Não alterado
- `reopenMutation`, botão manual "Reabrir", visual, RLS, publicação realtime (`whatsapp_conversations` e `whatsapp_messages` já publicadas).
