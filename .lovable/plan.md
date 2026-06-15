## Problema

O áudio do Miguel (e outras 4+ mensagens recentes) está sem `media_url` no banco — o campo está vazio. Por isso o `<audio>` no chat fica em branco e não toca.

Isso acontece quando o webhook recebe a mensagem mas o `downloadAndUploadMedia` falha silenciosamente (Evolution API às vezes retorna sem base64 ou dá timeout). Hoje a mensagem é salva mesmo assim, sem URL, e não há como recuperar depois.

## Solução

### 1. Nova edge function `fetch-message-media`
- Recebe `messageId`.
- Busca a mensagem no banco, identifica a `instance_id` e o `message_id`/`remote_jid` original.
- Chama `chat/getBase64FromMediaMessage/{instance}` da Evolution API com `{ key: { id, remoteJid, fromMe } }` reconstruída.
- Faz upload para o bucket `whatsapp-media` e atualiza `whatsapp_messages.media_url` da linha.
- Retorna a URL pública.

### 2. UI no `MessageBubble.tsx`
Para mensagens `audio`/`image`/`video`/`document` cujo `media_url` esteja vazio:
- Renderiza um botão "Baixar áudio" (ou ícone equivalente para imagem/vídeo/documento) no lugar do player.
- Ao clicar, chama `fetch-message-media`, mostra spinner, e ao retornar a URL invalida a query de mensagens — o player passa a tocar normalmente.
- Em caso de erro mostra toast "Não foi possível baixar a mídia. Tente novamente."

### 3. Webhook (`evolution-webhook/index.ts`)
- Adicionar log explícito quando `downloadAndUploadMedia` retorna `null` (hoje só loga internamente, dificultando rastreio).
- Tentar 1 retry após 500 ms antes de desistir, reduzindo a chance de áudios sem URL.

### 4. Backfill imediato dos áudios do Miguel
Após deploy, rodar a nova função para as duas mensagens existentes (`3263d7d4…` e `136dccc2…`) — pode ser disparado direto pela UI ao abrir a conversa, ou por um botão "Recuperar mídias faltantes" no menu da conversa (opcional, posso só deixar o auto-recovery pelo botão de cada mensagem).

## Fora do escopo
- Não vou criar a função `transcribe-audio` (já referenciada mas inexistente) neste passo — só silenciar o erro fire-and-forget para não poluir logs.
- Nenhuma mudança em RLS ou regras de atribuição.
