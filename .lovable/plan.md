## Objetivo

Remover a instância **Escritório Virtual** (`escritorio-virtual`) da plataforma (na evolution já foi removida por mim), para que você possa recadastrá-la do zero e isolar se o problema de envio está na plataforma, na Evolution ou no número WhatsApp Business.

## O que existe hoje

- 1 instância: `Escritório Virtual` (id `6611f9cd…aa1c`, status `disconnected`, empresa Denison Leandro Advocacia).
- 131 conversas vinculadas + mensagens, contatos, regras de atribuição, segredos da instância, jobs de sync, notas, sentimentos, tópicos, mídias no storage e webhooks.

## Passos da exclusão

1. **Logout + delete na Evolution API**
  - Chamar `DELETE /instance/logout/escritorio-virtual` e `DELETE /instance/delete/escritorio-virtual` via uma edge function temporária (usando o segredo salvo em `whatsapp_instance_secrets`), para que a sessão Baileys seja destruída no servidor Evolution antes de apagar o registro local.
  - Se a Evolution responder 404 (já não existe), seguimos adiante sem erro.
2. **Limpeza no banco (na ordem correta, dentro de uma transação)**
  - `whatsapp_reactions`, `whatsapp_message_edit_history`, `whatsapp_messages` → das conversas dessa instância.
  - `whatsapp_conversation_notes`, `whatsapp_conversation_summaries`, `whatsapp_sentiment_analysis`, `whatsapp_sentiment_history`, `whatsapp_topics_history`, `conversation_assignments` → das conversas dessa instância.
  - `whatsapp_conversations` da instância.
  - `whatsapp_contacts` exclusivos dessa instância (contatos que só aparecem nela).
  - `whatsapp_sync_jobs`, `assignment_rules`, `agent_instance_access`, `whatsapp_webhook_events`, `whatsapp_instance_secrets` da instância.
  - `whatsapp_instances` (a linha em si).
3. **Limpeza dos arquivos de mídia**
  - Apagar os objetos do bucket `whatsapp-media` sob o prefixo `escritorio-virtual/` (áudios, imagens, documentos recebidos/enviados por essa instância).

## Segurança / o que fica preservado

- Nenhuma outra instância da empresa ou de outras empresas é tocada.
- Contatos que também existem em outras instâncias da mesma empresa não são apagados (só os que pertencem exclusivamente à Escritório Virtual).
- Usuários, papéis, permissões e configurações da empresa continuam intactos.

## Pós-exclusão (você faz na interface)

1. Ir em **Configurações → Instâncias → Adicionar instância** e cadastrar novamente com nome novo (ex.: `escritorio-virtual-v2`) — recomendo não reusar o mesmo `instance_name` para evitar resquício do lado da Evolution.
2. Ler o QR Code no WhatsApp Business do escritório.
3. Enviar uma mensagem de teste. Se o envio funcionar: o problema era sessão zumbi na Evolution. Se continuar falhando: o problema é no número Business (bloqueio / limite do WhatsApp), não na plataforma.

## Detalhes técnicos

- A ordem de DELETE respeita foreign keys `ON DELETE CASCADE` onde existem, mas faço explícito para ter contagem de linhas apagadas e log auditável.
- A edge function temporária de logout/delete usa `SUPABASE_SERVICE_ROLE_KEY` e o `apikey` da Evolution armazenado; nada é exposto ao cliente.
- Se a Evolution estiver fora do ar no momento, ainda assim apago o registro local e te aviso para depois rodar um "delete" manual lá.