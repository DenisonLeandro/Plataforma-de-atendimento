## Causa

A página quebra com `cannot add 'postgres_changes' callbacks for realtime:sync_jobs_<id> after 'subscribe()'` lançado em `useSyncWhatsAppHistory.ts:92`. Cada `InstanceCard` chama `useSyncJob` **duas vezes** (direto e via `useSyncJobCompletion`), e ambas tentam criar o canal Realtime com o **mesmo nome** `sync_jobs_${instance_id}`. Na versão atual do `@supabase/supabase-js` (recém-atualizada para resolver o aviso de segurança de dependências), `supabase.channel(name)` devolve o canal já existente; como o primeiro `useEffect` já chamou `.subscribe()`, o segundo `.on('postgres_changes', ...)` é rejeitado e derruba o ErrorBoundary.

## Correção

Arquivo: `src/hooks/whatsapp/useSyncWhatsAppHistory.ts`

1. Dar a cada assinatura do canal um nome único por instância de hook usando `React.useId()` — `sync_jobs_${instance_id}_${uid}` — para que duas montagens (ou StrictMode) não compartilhem o mesmo canal.
2. Manter o `removeChannel` no cleanup.

Nenhuma mudança de lógica de negócio, nenhuma alteração de schema. É só uma correção de compatibilidade com a nova versão do supabase-js.

## Validação

- Recarregar `/whatsapp/settings?tab=instances` e confirmar que os cards renderizam sem o ErrorBoundary.
- Disparar uma sincronização e verificar que o progresso continua atualizando em tempo real (o canal único por hook ainda recebe os eventos).