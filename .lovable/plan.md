
# Áudios: por que chegam quebrados e como blindar o fluxo

## O que descobri

Áudio tem hoje 4 pontos de falha em sequência. Basta um falhar para o balão ficar "carregando" para sempre, "indisponível" ou reproduzir cortado.

1. **Sync histórico não baixa áudio nenhum.** `sync-whatsapp-history` insere a linha com `media_url = null` e sem `media_status` (fica no default `none`). No banco, **517 áudios dos últimos 14 dias estão nesse estado** — nunca terão URL porque nenhum job de recuperação roda em cima deles. O `MessageBubble` até tenta auto-fetch, mas só quando o usuário abre a conversa; se a mídia já expirou no WhatsApp, cai em `unavailable` e some.

2. **Webhook ao vivo só tenta baixar 3 vezes (0s / 5s / 20s) e desiste.** Hoje há **94 áudios** em `media_status='failed'`. Não existe cron nem retry tardio. Se a Evolution/VPS piscou naquele minuto, o áudio nunca mais volta.

3. **`getMessageType` não desembrulha áudios encapsulados** (`ephemeralMessage.message.audioMessage`, `viewOnceMessageV2`, `pttMessage` legado, `audioMessage` dentro de `deviceSentMessage`). Esses caem em `text` e nem sequer entram no fluxo de mídia — daí o "aparece algo enviado mas fica em branco".

4. **`AudioMessagePlayer` recria o `<audio>` a cada mudança de `mediaUrl`.** Quando a Realtime devolve o mesmo row com o `media_url` levemente alterado (ex.: retry gravou nova URL, ou a signed URL renovou), o hook `useSignedUrl` retorna outra string e o `useEffect([mediaUrl])` destrói o elemento no meio do play → "trava no meio". Também não seta `crossOrigin` nem `preload='auto'`, o que faz Chrome/Safari abortar streams grandes.

5. **`transcribe-audio` é disparado por `fetch(...)` solto dentro de `waitUntil`**, sem `waitUntil` próprio. Se a função-mãe encerra antes, a transcrição é cortada e o balão fica "Transcrevendo áudio…" eternamente.

6. **`recoverMessageMedia` marca `unavailable` cedo demais.** Um único `findMessages` que retorne vazio (comum quando a Evolution está sob carga) sela a mensagem como perdida para sempre, sem tentar mais tarde.

## Plano (não-técnico)

**A. Nunca perder áudio novo**
- Toda mensagem que chega no webhook e for identificada como áudio entra num pipeline com **retries persistentes** (5 tentativas, com espera crescente até 5 minutos, guardadas no banco).
- Se depois disso ainda não veio, um **job automático a cada 5 minutos** reprocessa `media_status IN ('pending','failed')` das últimas 24 h.
- Suporte a áudios encapsulados (efêmeros, "ver uma vez", PTT, deviceSent) — hoje ignorados.

**B. Recuperar o passado**
- Backfill único que reprocessa todos os áudios sem URL dos últimos 30 dias (todas empresas, todas instâncias). Reaproveita `recoverMessageMedia`. Sem alterar histórico texto, sem tocar em conversas encerradas.
- Marca como `unavailable` **apenas depois de 2 tentativas separadas por > 6 h** falharem, em vez de na primeira.

**C. Reprodução estável no player**
- `AudioMessagePlayer` deixa de recriar o elemento quando a URL muda apenas por causa de renovação de signed URL: memoiza a URL "estável" pelo `messageId` e só remonta se o `messageId` mudar.
- Adiciona `preload='auto'` e usa `<audio>` HTML nativo com `type` correto por trás do controle custom (evita o transcode WAV desnecessário no Chrome, mantém fallback só para Safari).
- Se `media_status='pending'` (ainda baixando), mostra spinner com "Baixando áudio…" em vez de tentar montar o player com URL quebrada.

**D. Transcrição não corta mais no meio**
- `transcribe-audio` passa a ser enfileirado (mesma tabela `whatsapp_webhook_events` reaproveitada) e disparado via `waitUntil` correto, com retry se der 5xx/timeout. Nunca mais fica "transcrevendo…" para sempre.

**E. Observabilidade**
- Log estruturado por instância/empresa quando um áudio falha, para conseguirmos ver rapidamente se uma instância específica está com problema (ex.: VPS lenta).
- Contador no card da instância: "X áudios pendentes de download" para o admin ver que algo está preso.

## Detalhes técnicos

**Backend**
1. `_shared/evolution-helpers.ts` — `getMessageType` desembrulha `ephemeralMessage`, `viewOnceMessage(V2|V2Extension)`, `deviceSentMessage.message`, e reconhece `pttMessage` como `audio`.
2. `evolution-webhook/index.ts` — `downloadAndAttachWebhookMedia`: aumentar `delays` para `[0, 3s, 15s, 60s, 300s]`; se todas falharem, deixar `media_status='pending'` (não `failed`) para o cron pegar. Transcrição passa a ser `EdgeRuntime.waitUntil(fetch(...))`.
3. `sync-whatsapp-history/index.ts` — no `flushBatch`, itens com `message_type` de mídia entram com `media_status='pending'`. Após o flush, enfileirar recuperação em lote (chama `recoverMessageMedia` por N=10 em background para itens dos últimos 30 dias).
4. Novo edge function `retry-pending-media` + `pg_cron` a cada 5 min: processa até 50 áudios com `media_status IN ('pending','failed')` e `created_at > now() - '24h'`, respeitando `media_retry_count < 8`.
5. `_shared/media-recovery.ts` — mudar transição para `unavailable`: só marcar assim quando `media_retry_count >= 2` **e** última tentativa foi > 6 h atrás. Caso contrário, manter `pending` e incrementar contador.
6. Backfill único (script SQL + chamada em lote): reprocessar áudios dos últimos 30 dias com `media_url IS NULL`.

**Frontend**
7. `src/components/chat/AudioMessagePlayer.tsx`:
   - `useEffect` passa a depender de `[messageId]` (não `[mediaUrl]`); ler `mediaUrl` via `ref` atualizada por outro `useEffect`.
   - `preload='auto'`, `crossOrigin='anonymous'`.
   - Só rodar `transcodeToWav` em Safari (`navigator.vendor.includes('Apple')`).
8. `src/components/chat/MessageBubble.tsx`:
   - Case `audio`: se `media_status==='pending'`, renderizar o placeholder de "Baixando áudio…" com spinner em vez de tentar o player.
   - Auto-fetch: remover exclusão do estado `'pending'` — hoje ele pula, mas se ficou preso por >2 min o usuário nunca vê retry manual visível.

**Banco**
9. Migration: índice parcial `CREATE INDEX ... ON whatsapp_messages(created_at) WHERE message_type='audio' AND media_status IN ('pending','failed');` (para o cron ser instantâneo).
10. `pg_cron`: schedule `retry-pending-media` a cada 5 min via HTTP → edge function.

## O que **não** vai mudar
- Fluxo de envio de áudio (já funciona).
- Layout do balão / cores / ícones.
- Regras de RLS / multi-tenant.
- Comportamento de outros tipos de mídia (imagem/vídeo/doc) — as correções B/D/E se aplicam, mas o comportamento visual continua idêntico.

## Como vou verificar
- Reprocessar os 517 áudios pendentes e confirmar via SQL que caem para `available` ou `unavailable` (não ficam em `none`).
- Enviar áudio novo pela Evolution real e conferir que o `<audio>` toca sem pause no meio, e que a transcrição aparece.
- Simular Evolution offline por 2 min e confirmar que o cron recupera o áudio automaticamente depois.
