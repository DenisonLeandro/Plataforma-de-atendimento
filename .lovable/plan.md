## Problema

Você quer continuar pelo app as conversas que estão acontecendo no WhatsApp. Mas a sincronização atual cria toda conversa importada com status `closed` (arquivada), e a tela `/whatsapp` mostra por padrão só as conversas em aberto (`active`/`reopened`). Resultado: os 1.088 contatos chegaram, mas nenhuma conversa aparece na lista de Conversas.

Trecho responsável (`supabase/functions/sync-whatsapp-history/index.ts`):

```ts
.insert({
  instance_id: instanceId,
  contact_id: contactId,
  status: 'closed',   // <- por isso some da tela "Em Aberto"
})
```

## Plano

### 1. Marcar como "em aberto" as conversas recentes durante a sincronização

Na função `sync-whatsapp-history`, ao importar mensagens de um chat:

- Calcular o `timestamp` da mensagem mais recente importada para aquele chat.
- Se a última mensagem é **dos últimos 30 dias**, gravar/atualizar a conversa com:
  - `status = 'active'`
  - `last_message_at = <timestamp>`
  - `last_message_preview = <preview da última msg>`
  - `last_message_is_from_me = <bool>`
- Se for mais antigo que 30 dias, manter como `closed` (histórico arquivado, não polui a caixa "Em Aberto").
- Conversas que já existem com status diferente de `closed` (ex.: alguém já abriu manualmente) **não são rebaixadas** — só atualizamos `last_message_*`.

Isso resolve o caso de uso: chats em andamento no celular passam a aparecer imediatamente em **Conversas → Em Aberto**, prontos pra você responder pelo app.

### 2. Toast pós-sync com atalho pra Conversas

No `InstanceCard.tsx`, quando o sync termina e veio `chats_synced > 0`, mostrar toast com botão **"Ver Conversas"** que leva pra `/whatsapp` (filtrando pela instância via `?instance=<id>`).

Hoje o toast só aponta pra `/whatsapp/contatos` quando `chats === 0`. Agora cobrimos o caminho positivo também.

### 3. Aceitar `?instance=` em `/whatsapp`

`WhatsApp.tsx` lê `useSearchParams()` e usa `?instance=<id>` como `selectedInstanceId` inicial, igual ao que já fizemos em `/whatsapp/contatos`. Sem o parâmetro, comportamento atual (todas as instâncias) é mantido.

## Detalhes técnicos

**Arquivos alterados:**
- `supabase/functions/sync-whatsapp-history/index.ts` — após o `flushBatch` de cada chat, fazer um `update` em `whatsapp_conversations` com `status`, `last_message_at`, `last_message_preview`, `last_message_is_from_me`, condicionado à janela de 30 dias e ao status atual da conversa.
- `src/components/settings/InstanceCard.tsx` — adicionar branch de toast com action button quando `chats_synced > 0`.
- `src/pages/WhatsApp.tsx` — ler `useSearchParams()` e inicializar `selectedInstanceId`.

**Não vou mexer:**
- RLS / policies (sem mudança).
- Schema do banco (campos já existem).
- Hook de sincronização no cliente (`useSyncWhatsAppHistory`).
- Lógica do webhook (continua tratando mensagens novas como sempre).

## O que você verá depois

1. Clica **Sincronizar histórico** numa instância.
2. Ao terminar: toast "X conversas importadas — Ver Conversas".
3. Clica → vai pra `/whatsapp` já filtrada pela instância, com as conversas recentes do celular listadas em **Em Aberto**, prontas pra responder.
