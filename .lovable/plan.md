## Problema

Hoje os áudios do WhatsApp chegam em **OGG/Opus** (formato nativo do WhatsApp). O `<audio>` HTML simples que usamos:

- Falha em **Safari/iOS** (não decodifica `audio/ogg; codecs=opus`).
- Fica em branco se o `media_mimetype` salvo não bater com o codec real.
- Quando o download da Evolution falha, mostra o botão "Baixar áudio" (que o usuário não quer mais ver).

Além disso, a função `transcribe-audio` é **chamada pelo webhook mas nunca foi criada** — por isso nada nunca foi transcrito e os logs ficam cheios de erro.

## Solução

### 1. Player de áudio próprio (estilo WhatsApp) — `src/components/chat/AudioMessagePlayer.tsx`

Componente novo que substitui o `<audio controls>` cru em `MessageBubble`. Visual parecido com WhatsApp:

```text
[▶/⏸]  ▁▂▅▇▅▂▁▂▅▇▅▂▁   0:14 / 0:32
         (waveform/barra de progresso)
        🅰️  Transcrição: "Oi, tudo bem? Queria saber..."
```

- Um único `<audio>` por mensagem controlado via `useRef`, com estados `playing`/`loading`/`error` e pausa automática de outros players ao iniciar um novo (singleton via contexto leve ou `window` event).
- Velocidade de reprodução (1x / 1.5x / 2x) como o WhatsApp.
- Barra de progresso clicável + tempo decorrido.
- Fallback de compatibilidade:
  1. Tenta reproduzir o `media_url` direto.
  2. Se `audio.error` disparar (ex.: Safari sem Opus), faz **fetch do arquivo + decode via `AudioContext.decodeAudioData` + reencode para WAV** em memória e troca o `src` por um Blob URL. Resolve Safari sem precisar de ffmpeg no servidor.
  3. Se mesmo assim falhar, mostra mensagem discreta "Áudio indisponível" (sem mais botão "Baixar").

### 2. Recuperação automática de áudios sem URL

No `MessageBubble` (e dentro do novo player), quando `message.message_type === 'audio'` e `media_url` está vazio:

- Em vez de mostrar o botão "Baixar", **dispara automaticamente** `fetch-message-media` ao montar o componente (uma vez, com guard) e mostra um spinner discreto "Carregando áudio…".
- Quando a função retorna a URL, o player aparece e toca normalmente.
- Mesma lógica vale para imagem/vídeo/documento — substitui o botão por carregamento automático com spinner; só em caso de falha final mostra "Mídia indisponível, tentar novamente".

### 3. Webhook: melhorar o salvamento de áudio

Em `supabase/functions/evolution-webhook/index.ts`:

- Forçar `mediaMimetype = 'audio/ogg; codecs=opus'` quando `messageType === 'audio'` e a Evolution retornar mimetype vazio/incorreto (hoje cai em `audio/*` e quebra o player).
- Manter os 2 retries já existentes para o download.

### 4. Nova edge function `transcribe-audio`

Cria `supabase/functions/transcribe-audio/index.ts` (chamada já existe no webhook):

- Recebe `{ messageId }`.
- Carrega a mensagem; valida que é áudio e tem `media_url`.
- Marca `transcription_status = 'processing'`.
- Baixa o áudio do bucket `whatsapp-media`, converte para base64.
- Chama Lovable AI Gateway (`google/gemini-2.5-flash`) via `/v1/chat/completions` com bloco `input_audio` (`format: "ogg"` para OGG/Opus do WhatsApp; `webm`/`mp4` quando aplicável) e prompt "Transcreva o áudio em português, fielmente, sem comentários".
- Trata 429 (rate limit) e 402 (sem créditos) com `transcription_status = 'failed'` e log claro.
- Salva o texto em `audio_transcription` e `transcription_status = 'completed'`.
- Retorna `{ success, transcription }`.

### 5. Exibir transcrição no chat

Dentro do `AudioMessagePlayer`, abaixo dos controles:

- Se `transcription_status === 'processing'`: ícone pequeno + "Transcrevendo áudio…".
- Se `transcription_status === 'completed'` e tem `audio_transcription`: mostra o texto em um bloco discreto, recolhível ("Ver transcrição" / "Ocultar"). Padrão recolhido para não poluir o chat.
- Se `failed`: ícone discreto com tooltip "Não foi possível transcrever". Botão "Tentar novamente" chama `transcribe-audio` de novo.
- Backfill: para áudios antigos sem transcrição, ao abrir a conversa um effect dispara `transcribe-audio` para até N (ex.: 10) áudios mais recentes que estão com `transcription_status IS NULL`. Sem fila pesada, só uma chamada por áudio.

### 6. Tipos e hook

- Atualizar `useWhatsAppMessages` (se necessário) para invalidar a query quando a transcrição completar — já temos realtime nas mensagens, então UPDATE em `whatsapp_messages` já chega via subscription existente. Verificar e, se faltar, incluir essas colunas no select.

## Detalhes técnicos

- **Modelo de IA:** `google/gemini-2.5-flash` via Lovable AI Gateway. Aceita áudio multimodal (OGG/Opus suportado como `format: "ogg"`), barato e rápido. Sem segredo adicional — usa `LOVABLE_API_KEY` que já existe.
- **Player no front:** sem nova dependência; só Web APIs (`HTMLAudioElement`, `AudioContext`). Re-encode para WAV só roda no caminho de fallback (Safari/iOS).
- **Storage/CORS:** o bucket `whatsapp-media` já é público; o fetch para re-encode funciona sem mudanças.
- **Sem alteração de RLS, regras de atribuição, ou esquema** (as colunas `audio_transcription`/`transcription_status` já existem na tabela).
- **Arquivos tocados:**
  - `src/components/chat/AudioMessagePlayer.tsx` (novo)
  - `src/components/chat/MessageBubble.tsx` (usa o novo player, remove botão "Baixar áudio", auto-fetch para mídia faltante)
  - `supabase/functions/transcribe-audio/index.ts` (novo)
  - `supabase/functions/evolution-webhook/index.ts` (mimetype default para áudio)

## Fora do escopo

- Não vou adicionar gravação/envio de áudio novo (já existe `AudioRecorder`).
- Não vou criar fila/worker dedicado para transcrição em massa — só backfill leve por conversa aberta.
