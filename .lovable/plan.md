## Objetivo

A edge function `sync-whatsapp-history` está rodando mas não importa nada. Sem logs detalhados e sem o body cru das respostas, não dá pra saber se a Evolution está devolvendo um formato inesperado, se o endpoint está errado, ou se o parsing falha silenciosamente. Vamos instrumentar a função, tornar o parsing tolerante a múltiplos formatos e devolver um diagnóstico completo pro cliente.

## Escopo (somente estes arquivos)

- `supabase/functions/sync-whatsapp-history/index.ts`
- `src/hooks/whatsapp/useSyncWhatsAppHistory.ts`
- `src/components/settings/InstanceCard.tsx`

Nada mais será tocado (sem migrations, sem `evolution-webhook`, sem `send-whatsapp-message`, sem dependências novas).

## Mudança 1 — `sync-whatsapp-history/index.ts`

**Voltar a execução para modo síncrono** (remover `EdgeRuntime.waitUntil`), porque o usuário precisa receber o array `diagnostics` na resposta. O cliente já vai ampliar o timeout para 5 min.

**Helper `extractList(payload)`** que tenta, nessa ordem:
1. `Array.isArray(payload)` → `payload`
2. `payload.records`
3. `payload.data`
4. `payload.messages?.records`
5. `payload.contacts` / `payload.chats`
6. `payload.items`
7. fallback `[]`

**Helper `fetchWithDiagnostics(step, url, init)`** que:
- Loga `console.log('[sync] ->', step, url, init.body)`
- Faz o fetch
- Lê `await res.text()` UMA vez
- Loga status, content-type, primeiros 800 chars
- Tenta `JSON.parse`; se falhar, `parsed = null`
- Retorna `{ status, contentType, rawSample, parsed }`

**Array `diagnostics`** acumulado em todas as chamadas; cap em 10 entradas (FIFO — primeiras 4 fixas: findContacts, findChats, e duas amostras de findMessages; depois sobrescreve as últimas).

**findContacts** e **findChats**: chamar `fetchWithDiagnostics`, usar `extractList` para obter a lista, registrar `parsed_count` no diagnostic.

**Contatos**:
- Não pular se `pushName`/`name` faltar — usar o telefone como fallback (já está parcialmente assim).
- Marcar `is_group = true` quando o JID termina em `@g.us`.
- Chave de upsert continua sendo `(instance_id, phone_number)` via `buildBrazilianVariants` (já implementado).

**findMessages com dois formatos**:
1. Tentativa A: `{ where: { key: { remoteJid } }, limit: 100, offset }`
2. Se `status === 200` E `extractList(parsed).length === 0` na primeira página, refazer com Tentativa B: `{ where: { remoteJid }, limit: 100, page: 1 }`
3. Registrar nos diagnostics qual formato funcionou (`step: "findMessages:<jid>:bodyA"` ou `"...:bodyB"`).
4. 404 continua tratado como vazio (sucesso).
5. Manter paginação atual.

**Resposta final** (status 200, mesmo com erros parciais):
```json
{
  "success": true,
  "chats_synced": n,
  "messages_synced": n,
  "contacts_synced": n,
  "diagnostics": [ { step, url, status, content_type, raw_sample, parsed_count }, ... ],
  "errors": [...]
}
```
Se a instância/secrets não forem encontrados, retornar `success: false` com `diagnostics` (vazio) e `error`.

## Mudança 2 — `useSyncWhatsAppHistory.ts`

- Em vez de `supabase.functions.invoke` (que não permite controlar timeout facilmente), montar a chamada com `fetch` direto para `${VITE_SUPABASE_URL}/functions/v1/sync-whatsapp-history`, passando o header `Authorization: Bearer <session.access_token>` e `apikey: VITE_SUPABASE_PUBLISHABLE_KEY`.
- Usar `AbortController` com timeout de **5 minutos** (300000 ms).
- No `onSuccess`, `console.log('[sync-whatsapp-history] result', data)` mostrando diagnostics completos.
- Atualizar `SyncHistoryResult` para incluir `diagnostics?: Array<{ step, url, status, content_type, raw_sample, parsed_count }>`.

## Mudança 3 — `InstanceCard.tsx`

No `handleSync`, após `mutateAsync` retornar `result`:
- Se `result.errors?.length > 0`:
  `toast.warning(\`\${chats} conversas, \${msgs} mensagens e \${contacts} contatos sincronizados (\${result.errors.length} avisos — veja console)\`)`
- Caso contrário:
  `toast.success(\`\${chats} conversas, \${msgs} mensagens e \${contacts} contatos sincronizados\`)`

Importar `toast` já existe. Nada mais muda no card (botão, dialog, ícones permanecem).

## Fora de escopo

- Sem alterações em migrations, RLS, outras edge functions, ou componentes.
- Sem novas dependências.
- Sem mudança no esquema de upsert nem nas constraints existentes.

## Como validar

1. Clicar "Sincronizar histórico" numa instância conectada.
2. Esperar (até 5 min). DevTools → Network: ver o JSON com `diagnostics`.
3. Conferir nos logs da edge function as URLs exatas, status e amostra do body cru de `findContacts`, `findChats` e `findMessages`.
4. Conferir se o toast mostra contagens > 0.
