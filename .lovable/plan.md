## Sincronizar histórico do WhatsApp

Adiciona um fluxo novo (sem tocar no que já funciona) para importar conversas, contatos e mensagens que já existem na Evolution API para dentro da nossa base.

### 1. Helpers compartilhados

Criar `supabase/functions/_shared/evolution-helpers.ts` com funções movidas do `evolution-webhook`:

- `normalizePhoneNumber(remoteJid)`
- `getMessageType(message)`
- `getMessageContent(message, type)`
- `isEditedMessage(message)`

No `supabase/functions/evolution-webhook/index.ts`, remover essas 4 funções locais e passar a importar do arquivo compartilhado. Nada mais é alterado nesse webhook.

### 2. Edge function `sync-whatsapp-history`

Novo arquivo `supabase/functions/sync-whatsapp-history/index.ts`:

- Body: `{ instance_id: string }`.
- Cliente Supabase com `SUPABASE_SERVICE_ROLE_KEY` (mesmo padrão de `send-whatsapp-message`).
- Carrega `whatsapp_instances` (para pegar `instance_name`, `provider_type`, `instance_id_external`) e `whatsapp_instance_secrets` (para `api_url`, `api_key`).
- Define `instanceIdentifier = provider_type === 'cloud' && instance_id_external ? instance_id_external : instance_name` (mesmo padrão de `test-evolution-connection` / `check-instances-status`).
- Header sempre `apikey: <api_key>` (mesmo padrão do projeto — registrado na memória).
- Fluxo:
  1. `POST {api_url}/chat/findChats/{instanceIdentifier}` → lista chats.
  2. `POST {api_url}/chat/findContacts/{instanceIdentifier}` → lista contatos. Para cada um, reaproveitar a lógica de upsert de contato em `whatsapp_contacts` (find por `instance_id + phone_number` com as variantes BR de 12/13 dígitos, criar se não existir, atualizar `name` e `profile_picture_url` quando vier).
  3. Para cada chat: paginar `POST {api_url}/chat/findMessages/{instanceIdentifier}` com body `{ where: { key: { remoteJid } }, limit: 100, offset: N }`. Ler `response.messages.records` (formato Evolution v2). Parar quando `currentPage >= pages` ou `records.length === 0`. 404 = chat vazio, segue adiante sem erro.
  4. Para cada mensagem:
     - `normalizePhoneNumber(remoteJid)` → resolve contato (`findOrCreateContact` simplificado, sem fetch de profile picture síncrono).
     - Resolve/cria a conversa (`findOrCreateConversation` simplificado — sem `applyAutoAssignment`, já que é histórico antigo).
     - Monta o registro para `whatsapp_messages` com `message_id = key.id`, `is_from_me = key.fromMe`, `timestamp` derivado de `messageTimestamp` (segundos → ISO), `content` via `getMessageContent`, `message_type` via `getMessageType`, `remote_jid`, `quoted_message_id` quando houver, `edited_at` quando `isEditedMessage`. Sem download de mídia (apenas guardar `media_url` se já vier na payload).
  5. Idempotência: usar `upsert` em `whatsapp_messages` com `onConflict: 'conversation_id,message_id'` (a constraint UNIQUE já existe — passo 4 da tarefa pode ser ignorado, ver seção "Banco" abaixo). Acumular em lotes de 50 e dar flush.
  6. `console.log` de progresso por lote: chat atual, total acumulado, erros.
- Resposta final: `{ success, chats_synced, messages_synced, contacts_synced, errors: [{chat, error}] }`.
- CORS padrão das outras functions; OPTIONS preflight.

### 3. Hook React

Novo `src/hooks/whatsapp/useSyncWhatsAppHistory.ts`: `useMutation` que chama `supabase.functions.invoke('sync-whatsapp-history', { body: { instance_id } })` e devolve os totais. Exportar em `src/hooks/whatsapp/index.ts`.

### 4. Botão no `InstanceCard`

Editar apenas `src/components/settings/InstanceCard.tsx`:

- Importar `Download` (lucide) e `Loader2`, `AlertDialog*` já está.
- Novo botão "Sincronizar histórico" no `CardFooter`, ao lado dos existentes. `disabled` quando `instance.status !== 'connected'` ou `syncMutation.isPending`. Mostra `Loader2` girando enquanto sincroniza.
- Ao clicar abre `AlertDialog` separado com o texto:
  > Isso vai importar todas as conversas e mensagens que a Evolution API tem em cache para esta instância. Pode demorar alguns minutos. Mensagens já importadas não serão duplicadas.
- Confirmação → dispara a mutation. Sucesso: `toast.success(\`${chats_synced} conversas e ${messages_synced} mensagens sincronizadas\`)`. Erro: `toast.error(error.message)`.

### 5. Banco — sem migration

Verifiquei `whatsapp_messages`: já existe a constraint UNIQUE `whatsapp_messages_conversation_id_message_id_key (conversation_id, message_id)`. Idempotência via `upsert(..., { onConflict: 'conversation_id,message_id' })` funciona direto. Passo 4 do pedido fica dispensado.

### O que NÃO muda

`send-whatsapp-message`, `edit-whatsapp-message`, funções de IA, schema do banco, RLS, hooks existentes, layout das outras telas. O `evolution-webhook` muda só nos imports das 4 helpers extraídas — comportamento idêntico.

### Detalhes técnicos

- Helpers compartilhados ficam em `supabase/functions/_shared/` (convenção Supabase para módulos reaproveitáveis entre functions).
- `findOrCreateContact` e `findOrCreateConversation` do sync são versões enxutas (sem auto-assignment, sem fetch de foto, sem auto-sentiment) para evitar custo/efeitos colaterais em backfill.
- Mensagens do tipo `reaction` / `protocolMessage` puros são ignoradas no insert (mesmo comportamento já existente para histórico).
- Sem retries automáticos: erros por chat vão para o array `errors` e a sync segue. O usuário pode reexecutar — é idempotente.
