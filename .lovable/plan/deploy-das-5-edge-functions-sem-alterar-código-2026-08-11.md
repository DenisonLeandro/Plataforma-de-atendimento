# Deploy das 5 edge functions (sem alterar código)

Publicar, exatamente como estão no repositório, as funções abaixo. Nenhum arquivo será editado, refatorado ou reescrito, e nenhuma migration será executada.

## Funções a publicar

1. `evolution-webhook` — permanece pública (sem JWT), conforme já declarado em `supabase/config.toml`
2. `sync-whatsapp-history`
3. `disconnect-instance` — função nova, criada no deploy
4. `reconnect-instance`
5. `sync-instance-webhook`

## Detalhes técnicos

- Os arquivos compartilhados em `supabase/functions/_shared/` (`instance-auth.ts`, `fetch-with-timeout.ts`, `evolution-helpers.ts`, `ai-usage.ts`, `media-recovery.ts`) são empacotados junto com cada função que os importa — verificados como presentes no repositório.
- `supabase/config.toml` já traz `verify_jwt = false` para `evolution-webhook` e `check-signup-eligibility`, e `verify_jwt = true` para reconnect/disconnect/sync-instance-webhook. Esse arquivo não será tocado; a configuração existente é respeitada no deploy.
- Nenhuma migration será aplicada nesta etapa.

## Verificação após o deploy

- Confirmar que as 5 funções foram publicadas com sucesso.
- Checar que `evolution-webhook` responde sem `Authorization` (ou seja, não retorna 401), garantindo que o recebimento de mensagens continua funcionando.
- Reportar a lista final de funções publicadas.
