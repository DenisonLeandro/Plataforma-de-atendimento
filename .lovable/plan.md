## Objetivo
Remover `console.log` de debug genérico nas edge functions (`supabase/functions/`), preservando logs de eventos de negócio, erros (`console.error`/`console.warn`) e logs com contadores de resultado. Após a limpeza, fazer deploy de todas as funções alteradas.

## Critérios de decisão

**REMOVER** (debug genérico):
- "Request received", "Starting", "Calling AI", "Response received"
- Dump de payloads (`JSON.stringify(aiData)`, `Evolution API response:`, `Parsed result:`)
- Logs de variáveis intermediárias (endpoints, base64 length, content preview, "Provider type:", "Approval config:", "Profile count:")
- "Checking profile", "Searching contacts", "Processing reaction:", "Processing message:"
- Logs trace passo-a-passo do sync (`[sync] ->`, `[sync] <-`, "chunk paused")

**MANTER** (eventos de negócio / contadores / erros):
- "Message sent and saved", "Message edited successfully", "Message saved successfully"
- "Contact created", "Contact phone updated", "Contact name updated", "Profile picture updated"
- "Conversation created", "Conversation REOPENED", "Conversation created as CLOSED"
- "Auto-assignment ... assigned successfully", "Fixed assignment to:", "Round-robin assignment to:"
- "Updated instance ... status to connected"
- "[auto-sentiment] Triggering...", "[auto-categorization] Triggering...", "Analysis saved successfully", "Conversa categorizada com sucesso", "Tópicos identificados"
- Reaction saved/removed (eventos de negócio)
- Sumários com contadores: `check-instances-status` "Check complete: X updated, Y errors", `sync-contact-profiles` "Updated/Failed", `sync-whatsapp-history` "Done:" e "final flush", `backfill-historical-media` JSON summary e status por mensagem, `setup-remix-infrastructure` "Created ... bucket"
- Reconnect: "Reconexão disparada"
- Invite: "User created", "Role updated"
- Todo `console.error` e `console.warn`

## Arquivos a editar (estimativa de remoções)
- `_shared/evolution-helpers.ts` — remove 2 (Downloading/Uploading), mantém "Media uploaded successfully"
- `analyze-whatsapp-sentiment/index.ts` — remove 5, mantém "Analysis saved successfully"
- `categorize-whatsapp-conversation/index.ts` — remove 3, mantém "Tópicos identificados" + "Conversa categorizada"
- `check-instances-status/index.ts` — remove 3 (Starting/Checking/per-instance), mantém "Check complete"
- `compose-whatsapp-message/index.ts` — remove 2
- `edit-whatsapp-message/index.ts` — remove 3, mantém "edited successfully" + "updated in database"
- `ensure-user-profile/index.ts` — remove 8 debug, mantém "Profile created", "First user auto-approved", "Role assigned"
- `evolution-webhook/index.ts` — remove ~15 debug (Unhandled, Searching, Processing reaction/message, phone/isGroup, Message type, Background profile error, "No active rule", "No agents", "Failed to fetch profile" status, Conversation found), mantém eventos (Contact created, phone/name updated, profile pic updated, assignments, conversation created/REOPENED, auto-sentiment/categorization trigger, reaction saved/removed, instance connected, background media saved, message saved)
- `invite-team-member/index.ts` — remove 1 ("Creating user"), mantém "User created" + "Role updated"
- `reconnect-instance/index.ts` — remove 2 (estado atual, forçando), mantém "Reconexão disparada"
- `send-whatsapp-message/index.ts` — remove 7 debug (Request received, Sending to, PRÉ-envio, Media converted, endpoint, Evolution API response, Extracted media URL, Audio payload prepared), mantém "Conversation REOPENED" + "Message sent and saved"
- `setup-project-config/index.ts` — remove 2, mantém "Configuration completed"
- `setup-remix-infrastructure/index.ts` — remove 2 (Starting, Creating buckets), mantém "Created bucket"/"already exists"/"Setup complete"
- `suggest-smart-replies/index.ts` — remove todos os 6 (debug puro)
- `sync-contact-profiles/index.ts` — remove 2 (Starting, Found N), mantém "Updated for contact", "No picture available", "Sync complete"
- `sync-whatsapp-history/index.ts` — remove 4 (chunk paused, [sync] -> / <-, Starting sync, linha 830 trace), mantém "Conversation created as CLOSED", "final flush", "Done:"
- `test-evolution-connection/index.ts` — remove 4 (todos debug)
- `test-instance-connection/index.ts` — remove 5 debug, mantém "Updated instance status to ..."
- `fix-contact-names/index.ts` — revisar 8 (provavelmente manter sumário final + atualizações; remover traces)
- `generate-conversation-summary/index.ts` — revisar 3 (manter "saved/created", remover Starting/Calling)
- `backfill-historical-media/index.ts` — manter os 4 (são status por mensagem + summary final)

Outros (`delete-user-account`, `diagnose-instance`, `fetch-message-media`, `resolve-lid-conversations`, `transcribe-audio`, `sync-whatsapp-history` etc.) — sem `console.log` ou apenas event logs; serão revisados antes de tocar.

## Deploy
Após edição, deploy via `supabase--deploy_edge_functions` de todas as functions alteradas em uma única chamada.

## O que NÃO será feito
- Nenhuma alteração em `src/`
- Nenhuma alteração em lógica, headers, respostas HTTP ou tratamento de erro
- Nenhuma alteração em `can_user_see_instance`, `can_access_conversation`, `can_view_conversation`
- Nenhum bypass de supervisor

## Entrega final
Relatório com: total de `console.log` removidos, total mantidos, lista de arquivos alterados, e confirmação de deploy.