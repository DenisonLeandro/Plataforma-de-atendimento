## Problema

O toast "Sincronização pausada pelo limite de tempo do navegador" aparece porque o sync hoje depende do navegador chamando a edge function em loop (até 5 minutos). Com 1.088 contatos + chats, o navegador estoura o limite antes de terminar — e se você fechar a aba, o sync para.

Trecho responsável (`src/hooks/whatsapp/useSyncWhatsAppHistory.ts`):

```ts
for (let chunk = 0; chunk < 100 && Date.now() - startedAt < maxTotalMs; chunk++) {
  const result = await callChunk(cursor);
  ...
}
aggregate.continued = true;
aggregate.message = 'Sincronização pausada pelo limite de tempo do navegador...';
```

## Plano

Mover a continuação do sync para **background na edge function**, com **status persistido no banco** e **polling do cliente**. O navegador só dispara o início e acompanha o progresso — pode fechar a aba.

### 1. Tabela de jobs de sincronização

Nova tabela `whatsapp_sync_jobs`:

```text
id              uuid pk
instance_id     uuid fk → whatsapp_instances
status          text  ('pending' | 'running' | 'completed' | 'failed')
cursor          jsonb (cursor atual entre chunks)
chats_synced       int default 0
messages_synced    int default 0
contacts_synced    int default 0
error_message   text
started_at      timestamptz default now()
updated_at      timestamptz default now()
finished_at     timestamptz
```

- RLS: SELECT/INSERT para `authenticated` (filtrado por instância via `can_user_see_instance`), ALL para `service_role`.
- GRANT explícito para `authenticated` e `service_role`.
- Realtime habilitado para a UI receber progresso ao vivo.

### 2. Edge function roda em background

`sync-whatsapp-history` passa a:

- Receber só `{ instance_id }` (sem `cursor` do cliente).
- Criar/recuperar job `running` para essa instância (se já houver um `running`, retornar o existente — evita dois sincs em paralelo).
- Usar `EdgeRuntime.waitUntil(...)` para rodar o loop de chunks no background.
- Cada chunk processado atualiza a linha do job (`cursor`, contadores, `updated_at`).
- Ao final: `status = 'completed'` e `finished_at = now()`. Em erro: `status = 'failed'` + `error_message`.
- Retornar imediatamente `202` com `{ job_id, status: 'running' }`.

O loop interno reaproveita a paginação e os cursores que já existem hoje, só que governado por `MAX_INVOCATION_MS` da própria edge function (limite da Cloud), não do navegador.

### 3. Cliente: dispara e faz polling (sem travar a aba)

`useSyncWhatsAppHistory` vira:

- `startSync(instance_id)`: chama a edge function, recebe `job_id`.
- `useSyncJob(instance_id)`: hook com Realtime + fallback de polling a cada 3s na tabela `whatsapp_sync_jobs`, retornando `status`, `chats_synced`, `messages_synced`, `contacts_synced`.

### 4. UI: progresso ao vivo no `InstanceCard`

- Botão **Sincronizar histórico** dispara o job e mostra estado: "Sincronizando… X conversas, Y mensagens" (badge/spinner inline, não bloqueia a aba).
- Toast só ao terminar:
  - `completed` → "X conversas importadas — Ver Conversas" (mantém o atalho atual para `/whatsapp?instance=<id>`).
  - `failed` → mostra `error_message`.
- Remove o toast "Sincronização pausada pelo limite do navegador".

## Detalhes técnicos

**Arquivos / migrações:**

- **Migração nova**: criar `whatsapp_sync_jobs` + GRANTs + RLS + adicionar tabela à publicação de realtime.
- `supabase/functions/sync-whatsapp-history/index.ts`: usar `EdgeRuntime.waitUntil`, persistir progresso, retornar `202` com `job_id`. Lógica de paginação/cursor é a mesma já existente (incluindo o sort por chat mais recente e a janela de 30 dias / 200 msgs por chat).
- `src/hooks/whatsapp/useSyncWhatsAppHistory.ts`: substituir loop de fetch por `startSync` (`mutation`) + `useSyncJob` (`query` com realtime).
- `src/components/settings/InstanceCard.tsx`: render do progresso + toast final com action button.

**Não vou mexer:**

- RLS de `whatsapp_conversations` / `whatsapp_messages` / `whatsapp_contacts`.
- Lógica de webhook (mensagens novas continuam chegando como sempre).
- Tela `/whatsapp` e `/whatsapp/contatos` (já leem `?instance=`).

## O que você verá depois

1. Clica **Sincronizar histórico** → botão vira "Sincronizando…" com contadores subindo.
2. Pode fechar a aba e voltar depois — o servidor continua o trabalho.
3. Quando termina: toast "X conversas importadas — Ver Conversas" e o card volta ao normal. Sem mais o aviso de "pausada pelo limite do navegador".
