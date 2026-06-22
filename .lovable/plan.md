
# Relatório de custos de IA — diagnóstico read-only

> Sem alterações de código. Sem migrations. Diagnóstico puro com base no código atual + queries prontas para o Denison rodar no SQL Editor do Lovable Cloud.

## 1. Resumo executivo

- Sistema tem **6 features de IA** ativas, todas via **Lovable AI Gateway** (sem chamadas diretas a OpenAI / Anthropic / Google).
- Modelos em uso: `google/gemini-2.5-flash` (4 features), `google/gemini-2.5-flash` via `compose-whatsapp-message`, `openai/gpt-4o-mini-transcribe` (transcrição de áudio).
- **3 features rodam automaticamente** (custo "invisível", o usuário não clica): análise de sentimento, categorização e transcrição de áudio — disparadas pelo `evolution-webhook`.
- **NÃO existe "painel de AI ativas"** no código atual (`src/pages/WhatsAppSettings.tsx` só tem abas Setup / Instâncias / Macros / Atribuição / Equipe / Acesso / Segurança). Se o Denison lembra disso, ou foi removido, ou está confundindo com outro projeto. **Sinalizado para confirmação.**
- Custo total acumulado e mensal **dependem do volume real** (Fase 4) — placeholders abaixo aguardam as queries da Fase 3.

---

## 2. Inventário de funcionalidades de IA (Fase 1)

| # | Feature (UX) | Edge function | Provider / Modelo | Trigger | Persistência | Campos persistidos |
|---|---|---|---|---|---|---|
| 1 | **Análise de sentimento** da conversa | `analyze-whatsapp-sentiment` | Lovable AI → `google/gemini-2.5-flash` (2 chamadas: análise + histórico) | **Automático** a cada **5 mensagens do cliente** (webhook); manual no botão da sidebar | `whatsapp_sentiment_analysis`, `whatsapp_sentiment_history` | sentiment, confidence_score, summary, reasoning, messages_analyzed |
| 2 | **Categorização automática** de conversas (tópicos) | `categorize-whatsapp-conversation` | Lovable AI → `google/gemini-2.5-flash` | **Automático** a cada **5 mensagens do cliente** (webhook); manual via botão | `whatsapp_conversations.metadata` + `whatsapp_topics_history` | primary_topic, secondary_topics, confidence, reasoning |
| 3 | **Resumo de conversa** | `generate-conversation-summary` | Lovable AI → `google/gemini-2.5-flash` | **Manual** (botão "Gerar resumo" na sidebar de detalhes) | `whatsapp_conversation_summaries` | summary, key_points, action_items, sentiment_at_time, messages_count |
| 4 | **Sugestões inteligentes de resposta** (as 3 sugestões) | `suggest-smart-replies` | Lovable AI → `google/gemini-2.5-flash` | **Manual** (componente `SmartReplySuggestions`, chamado quando user abre input/conversa) | Não persiste (ephemeral) | — apenas devolve sugestões ao client |
| 5 | **Compositor IA** (expandir / reformular / meu tom / amigável / formal / corrigir / traduzir) | `compose-whatsapp-message` | Lovable AI → `google/gemini-2.5-flash` | **Manual** (botão `AIComposerButton` no input) | Não persiste | — |
| 6 | **Transcrição de áudio** | `transcribe-audio` | Lovable AI → `openai/gpt-4o-mini-transcribe` (endpoint `/v1/audio/transcriptions`) | **Automático** em todo áudio recebido (webhook fire-and-forget); manual via botão "tentar novamente" | `whatsapp_messages.audio_transcription` + `transcription_status` | texto da transcrição |

### Sinalizações importantes (Fase 1)

- 🔴 **Custo invisível #1**: análise de sentimento dispara automaticamente a cada 5 mensagens do cliente (`AUTO_SENTIMENT_THRESHOLD = 5` em `evolution-webhook/index.ts:19`). Conversa longa = várias chamadas.
- 🔴 **Custo invisível #2**: categorização dispara igual, a cada 5 mensagens (`AUTO_CATEGORIZATION_THRESHOLD = 5`, linha 22). E ela **lê as últimas 50 mensagens** da conversa por chamada — input grande.
- 🔴 **Custo invisível #3**: transcrição é fire-and-forget em **todo** áudio recebido (linha 718 do webhook). Se chega muito áudio, custa muito.
- ⚠️ **`compose-whatsapp-message` busca histórico**: na ação `my_tone`, lê as últimas 20 mensagens enviadas pelo atendente para aprender o estilo — input maior por chamada.
- ⚠️ **`analyze-whatsapp-sentiment` faz 2 chamadas IA por execução** (análise principal + atualização do histórico). Multiplica o custo por 2.
- ❓ **"Painel de AI ativas"**: não encontrado no código. Não há flag de on/off por feature. Auto-sentiment, auto-categorização e auto-transcrição estão **hardcoded como ligadas**. **Confirmar com Denison se ele lembra desse painel ou era outra coisa.**

---

## 3. Preços unitários de referência (Fase 2)

**Data da referência: 22/06/2026.** ⚠️ Preços públicos podem mudar; confirmar no painel de billing do Lovable.

### Lovable AI Gateway (preço repassado dos providers + markup do Lovable)

O Lovable AI cobra em **créditos do workspace**, não em USD direto. Preço público dos modelos subjacentes (referência OpenAI/Google):

| Modelo | Input ($/1M tokens) | Output ($/1M tokens) | Observação |
|---|---|---|---|
| `google/gemini-2.5-flash` | ~$0.30 | ~$2.50 | Preço Google AI público |
| `openai/gpt-4o-mini-transcribe` | — | — | **$0.003/min de áudio** (Whisper-class pricing) |

> O custo real no Lovable é em créditos. O Denison precisa olhar **Settings → Plans & credits** no Lovable para ver o saldo e o consumo do AI Gateway no período. Esta tabela serve só como estimativa em USD do "custo equivalente" caso fosse chamado direto no provider.

### Estimativa de tokens médios por chamada

| Feature | Input tokens (estimado) | Output tokens (estimado) | Notas |
|---|---|---|---|
| Sentiment (chamada 1+2) | ~1.500 × 2 | ~300 × 2 | Lê últimas N mensagens; system prompt grande; 2 calls |
| Categorização | ~2.000 | ~150 | Lê últimas 50 mensagens de texto |
| Resumo de conversa | ~2.500 | ~400 | Lê últimas 30 mensagens + system prompt |
| Smart replies | ~1.500 | ~200 | 3 sugestões curtas |
| Composer | ~500 | ~150 | Prompt + mensagem do usuário |
| Transcrição áudio | — | — | Cobrado por **duração** ($/min), ~30s default |

### Custo estimado por chamada (USD, referência Gemini 2.5 Flash direto)

- Sentiment: `(1.500*2 × $0.30 + 300*2 × $2.50) / 1M ≈ $0.00240` por análise
- Categorização: `(2.000 × $0.30 + 150 × $2.50) / 1M ≈ $0.00098`
- Resumo: `(2.500 × $0.30 + 400 × $2.50) / 1M ≈ $0.00175`
- Smart reply: `(1.500 × $0.30 + 200 × $2.50) / 1M ≈ $0.00095`
- Composer: `(500 × $0.30 + 150 × $2.50) / 1M ≈ $0.00053`
- Transcrição: `$0.003 × 0,5 min ≈ $0.0015` por áudio (30s default)

> ⚠️ Valores em USD direto-no-provider. O Lovable AI Gateway aplica markup; o custo em créditos será maior. Use isto como **piso de referência**.

**Câmbio referência**: USD→BRL ≈ **R$ 5,40** (referência informativa, 22/06/2026). Confirmar.

---

## 4. QUERIES PARA DENISON RODAR (Fase 3)

> Copia e cola **uma por vez** no SQL Editor do Lovable Cloud, manda o resultado de volta.

### Q1 — Volume TOTAL desde o início, por feature

```sql
SELECT 'sentiment_analysis' AS feature, COUNT(*) AS total
FROM whatsapp_sentiment_analysis
UNION ALL
SELECT 'sentiment_history', COUNT(*) FROM whatsapp_sentiment_history
UNION ALL
SELECT 'categorization', COUNT(*) FROM whatsapp_topics_history
UNION ALL
SELECT 'conversation_summary', COUNT(*) FROM whatsapp_conversation_summaries
UNION ALL
SELECT 'audio_transcription_done',
       COUNT(*) FROM whatsapp_messages
       WHERE message_type = 'audio' AND transcription_status = 'completed';
```

### Q2 — Volume últimos 30 dias, por feature

```sql
SELECT 'sentiment_analysis' AS feature,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30d
FROM whatsapp_sentiment_analysis
UNION ALL
SELECT 'sentiment_history',
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')
FROM whatsapp_sentiment_history
UNION ALL
SELECT 'categorization',
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')
FROM whatsapp_topics_history
UNION ALL
SELECT 'conversation_summary',
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')
FROM whatsapp_conversation_summaries
UNION ALL
SELECT 'audio_transcription_done',
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')
FROM whatsapp_messages
WHERE message_type = 'audio' AND transcription_status = 'completed';
```

### Q3 — Volume geral de mensagens / conversas / áudios

```sql
SELECT
  (SELECT COUNT(*) FROM whatsapp_conversations) AS total_conversations,
  (SELECT COUNT(*) FROM whatsapp_messages) AS total_messages,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE message_type = 'audio') AS total_audios,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE is_from_me = false) AS total_client_messages;
```

### Q4 — Últimos 30 dias (mensagens / conversas novas)

```sql
SELECT
  (SELECT COUNT(*) FROM whatsapp_conversations WHERE created_at >= NOW() - INTERVAL '30 days') AS new_conversations_30d,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE created_at >= NOW() - INTERVAL '30 days') AS messages_30d,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE message_type = 'audio' AND created_at >= NOW() - INTERVAL '30 days') AS audios_30d,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE is_from_me = false AND created_at >= NOW() - INTERVAL '30 days') AS client_messages_30d;
```

### Q5 — Top 5 conversas que mais consumiram IA

```sql
SELECT
  c.id AS conversation_id,
  COALESCE(ct.name, ct.phone_number, 'sem nome') AS contact,
  (SELECT COUNT(*) FROM whatsapp_sentiment_analysis WHERE conversation_id = c.id) AS sentiment_calls,
  (SELECT COUNT(*) FROM whatsapp_topics_history WHERE conversation_id = c.id) AS categorization_calls,
  (SELECT COUNT(*) FROM whatsapp_conversation_summaries WHERE conversation_id = c.id) AS summary_calls,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = c.id AND message_type='audio' AND transcription_status='completed') AS audio_transcriptions,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = c.id) AS total_messages
FROM whatsapp_conversations c
LEFT JOIN whatsapp_contacts ct ON ct.id = c.contact_id
ORDER BY (
  (SELECT COUNT(*) FROM whatsapp_sentiment_analysis WHERE conversation_id = c.id) +
  (SELECT COUNT(*) FROM whatsapp_topics_history WHERE conversation_id = c.id) +
  (SELECT COUNT(*) FROM whatsapp_conversation_summaries WHERE conversation_id = c.id) +
  (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = c.id AND message_type='audio' AND transcription_status='completed')
) DESC
LIMIT 5;
```

### Q6 — Transcrições: status agregado

```sql
SELECT transcription_status, COUNT(*) AS qtd
FROM whatsapp_messages
WHERE message_type = 'audio'
GROUP BY transcription_status
ORDER BY qtd DESC;
```

> Não há campo de duração de áudio persistido — usar 30s como default na Fase 4 (ou refinar com base no `metadata` se houver `seconds` lá; dá pra rodar uma Q7 opcional).

### Q7 (opcional) — Tentar extrair duração de áudio do metadata

```sql
SELECT
  AVG((metadata->>'seconds')::numeric) AS avg_seconds,
  MIN((metadata->>'seconds')::numeric) AS min_seconds,
  MAX((metadata->>'seconds')::numeric) AS max_seconds,
  COUNT(*) FILTER (WHERE metadata ? 'seconds') AS audios_with_duration
FROM whatsapp_messages
WHERE message_type = 'audio';
```

---

## 5. (Placeholder) Cálculo estimado — Fase 4

> Preencher após Denison rodar Q1–Q7. Template:

| Feature | Provider/Modelo | Custo unit. (USD) | Volume total | **Custo acumulado (USD)** | Volume 30d | **Custo mensal (USD)** |
|---|---|---|---|---|---|---|
| Sentiment | LovableAI/Gemini 2.5 Flash | $0.00240 | _aguardando Q1_ | _calc_ | _aguardando Q2_ | _calc_ |
| Categorização | LovableAI/Gemini 2.5 Flash | $0.00098 | _aguardando Q1_ | _calc_ | _aguardando Q2_ | _calc_ |
| Resumo | LovableAI/Gemini 2.5 Flash | $0.00175 | _aguardando Q1_ | _calc_ | _aguardando Q2_ | _calc_ |
| Smart replies | LovableAI/Gemini 2.5 Flash | $0.00095 | **não persistido** | ❓ sem dado | ❓ sem dado | ❓ |
| Composer | LovableAI/Gemini 2.5 Flash | $0.00053 | **não persistido** | ❓ sem dado | ❓ sem dado | ❓ |
| Transcrição | LovableAI/gpt-4o-mini-transcribe | $0.0015 (30s) | _aguardando Q1_ | _calc_ | _aguardando Q2_ | _calc_ |
| **TOTAL** | | | | **_soma_** | | **_soma_** |

> Conversão para BRL: multiplicar por R$ 5,40 (referência).
> ❗ Smart replies e Composer **não persistem nada** — sem dado de volume. Para medir esses dois precisaria adicionar logging (não está no escopo deste diagnóstico).

---

## 6. (Placeholder) Exemplos por atendimento — Fase 5

> Preencher após Q5. Template para 3-5 conversas:

```
Contato: <nome>
Mensagens trocadas: <total_messages>
Chamadas de IA:
  - Sentiment: <n> × $0.00240 = $<x>
  - Categorização: <n> × $0.00098 = $<x>
  - Resumo: <n> × $0.00175 = $<x>
  - Transcrição de áudio: <n> × $0.0015 = $<x>
Custo total estimado: $<soma> ≈ R$ <soma×5,40>
```

---

## 7. Avisos / limitações (Fase 6)

- **Custo do Lovable propriamente dito** (mensalidade do plano + créditos de geração de código + créditos do AI Gateway consumidos em créditos, não em USD direto): **NÃO levantado aqui**. Está em Settings → Plans & credits no Lovable. Denison precisa olhar lá.
- **Tokens reais variam por mensagem** — as estimativas usam médias conservadoras. Pode divergir ±30%.
- **Preços públicos podem estar desatualizados** (referência 22/06/2026). Lovable AI Gateway aplica markup sobre o preço do provider — o número em USD é **piso**, o custo em créditos será maior.
- **Smart replies e Composer não persistem nada** no banco. Sem volume mensurável a partir das tabelas. Se quiser saber o custo deles, precisa: (a) adicionar tabela de log, ou (b) extrair dos logs das edge functions no painel do Lovable Cloud (`supabase--edge_function_logs`).
- **Storage / DB rows / edge function invocations / egress**: também consomem créditos do Lovable Cloud. Não cobertos aqui — ver dashboard de billing.
- **Duração de áudio** assumida em 30s (não há campo dedicado). A Q7 tenta extrair do `metadata`; se vier vazia, manter 30s como estimativa.
- **Auto-categorização lê 50 mensagens por chamada** — input maior do que a média, custo real pode ser ~2× a estimativa para conversas longas.
- **Auto-sentiment dispara a cada 5 mensagens do cliente**: numa conversa com 50 mensagens do cliente, isso são 10 análises = 20 chamadas IA (porque sentiment faz 2 calls por execução). Custo significativo em conversas grandes.
- **Painel de "AI ativas" não existe no código atual** — confirmar com Denison se ele se refere a outra coisa (dashboard externo? expectativa futura?). Hoje, **não há toggle de on/off** para as features automáticas — para desativar, precisa mudar código.

---

## Próximo passo

Denison roda **Q1 a Q7** no SQL Editor do Lovable Cloud e me passa os resultados. Eu preencho **Fase 4 (tabela de custo)** e **Fase 5 (exemplos)** com base nos números reais.
