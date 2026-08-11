-- Funde as conversas duplicadas de cada contato e impede que voltem a existir.
--
-- Causa raiz: findOrCreateConversation buscava a conversa existente com
-- .maybeSingle(), que devolve nulo quando ha mais de uma linha. A partir da
-- primeira duplicata, toda mensagem nova caia no ramo de criacao e abria outra
-- conversa -- chegando a 45 para um unico contato. Nada no banco impedia,
-- porque nao existia restricao unica em (instance_id, contact_id).
--
-- Esta migration:
--   1. elege a conversa mais antiga de cada (instance_id, contact_id);
--   2. move todos os registros filhos das duplicatas para ela;
--   3. recalcula os agregados da conversa que fica;
--   4. apaga as duplicatas ja esvaziadas;
--   5. cria a restricao unica que torna o problema impossivel.
--
-- Idempotente: rodar de novo apos a limpeza nao encontra duplicatas e nao faz
-- nada. Roda inteira em uma transacao -- ou tudo funde, ou nada muda.
--
-- IMPORTANTE: publique antes a versao corrigida da edge function
-- evolution-webhook. Com a restricao unica ativa e o codigo antigo no ar, a
-- insercao de conversa passa a falhar com 23505 em vez de reaproveitar a
-- conversa existente.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Mapa duplicata -> guardia (a mais antiga de cada contato por instancia)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE conv_merge_map ON COMMIT DROP AS
SELECT c.id AS dup_id, k.keeper_id
FROM public.whatsapp_conversations c
JOIN (
  SELECT instance_id,
         contact_id,
         (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS keeper_id
  FROM public.whatsapp_conversations
  GROUP BY instance_id, contact_id
  HAVING count(*) > 1
) k
  ON k.instance_id = c.instance_id
 AND k.contact_id  = c.contact_id
WHERE c.id <> k.keeper_id;

CREATE INDEX ON conv_merge_map (dup_id);

-- Agregados das duplicatas, capturados antes de qualquer exclusao.
CREATE TEMP TABLE conv_keeper_agg ON COMMIT DROP AS
SELECT map.keeper_id,
       SUM(COALESCE(c.unread_count, 0))                       AS extra_unread,
       BOOL_OR(c.status = 'active')                           AS any_active,
       (array_remove(
          array_agg(c.assigned_to ORDER BY c.updated_at DESC), NULL))[1] AS fallback_assigned
FROM conv_merge_map map
JOIN public.whatsapp_conversations c ON c.id = map.dup_id
GROUP BY map.keeper_id;

-- ---------------------------------------------------------------------------
-- 2. Mover os registros filhos
-- ---------------------------------------------------------------------------

-- whatsapp_messages tem UNIQUE(conversation_id, message_id): se a mesma
-- mensagem existe na guardia e na duplicata, mover as duas colidiria. Mantem
-- uma copia por (guardia, message_id), preferindo a que ja esta na guardia.
DELETE FROM public.whatsapp_messages
WHERE id IN (
  SELECT id FROM (
    SELECT m.id,
           row_number() OVER (
             PARTITION BY COALESCE(map.keeper_id, m.conversation_id), m.message_id
             ORDER BY (map.keeper_id IS NULL) DESC, m.created_at ASC, m.id ASC
           ) AS rn
    FROM public.whatsapp_messages m
    LEFT JOIN conv_merge_map map ON map.dup_id = m.conversation_id
    WHERE m.conversation_id IN (SELECT dup_id    FROM conv_merge_map)
       OR m.conversation_id IN (SELECT keeper_id FROM conv_merge_map)
  ) ranked
  WHERE rn > 1
);

UPDATE public.whatsapp_messages m
SET conversation_id = map.keeper_id
FROM conv_merge_map map
WHERE m.conversation_id = map.dup_id;

-- whatsapp_sentiment_analysis tem conversation_id UNICO: so pode sobrar uma
-- analise por conversa. Descarta a da duplicata quando a guardia ja tem uma.
DELETE FROM public.whatsapp_sentiment_analysis s
USING conv_merge_map map
WHERE s.conversation_id = map.dup_id
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_sentiment_analysis k
    WHERE k.conversation_id = map.keeper_id
  );

-- Sobrando varias duplicatas com analise e nenhuma na guardia, fica a mais recente.
DELETE FROM public.whatsapp_sentiment_analysis
WHERE id IN (
  SELECT id FROM (
    SELECT s.id,
           row_number() OVER (PARTITION BY map.keeper_id ORDER BY s.created_at DESC, s.id) AS rn
    FROM public.whatsapp_sentiment_analysis s
    JOIN conv_merge_map map ON map.dup_id = s.conversation_id
  ) ranked
  WHERE rn > 1
);

UPDATE public.whatsapp_sentiment_analysis s
SET conversation_id = map.keeper_id
FROM conv_merge_map map
WHERE s.conversation_id = map.dup_id;

-- Demais filhos: sem restricao que possa colidir, basta reapontar.
-- (whatsapp_reactions tem unique em (message_id, reactor_jid), que nao inclui
--  conversation_id -- por isso mover a linha nunca conflita.)
UPDATE public.whatsapp_reactions r
SET conversation_id = map.keeper_id
FROM conv_merge_map map WHERE r.conversation_id = map.dup_id;

UPDATE public.whatsapp_message_edit_history h
SET conversation_id = map.keeper_id
FROM conv_merge_map map WHERE h.conversation_id = map.dup_id;

UPDATE public.whatsapp_conversation_notes n
SET conversation_id = map.keeper_id
FROM conv_merge_map map WHERE n.conversation_id = map.dup_id;

UPDATE public.whatsapp_conversation_summaries su
SET conversation_id = map.keeper_id
FROM conv_merge_map map WHERE su.conversation_id = map.dup_id;

UPDATE public.whatsapp_sentiment_history sh
SET conversation_id = map.keeper_id
FROM conv_merge_map map WHERE sh.conversation_id = map.dup_id;

UPDATE public.whatsapp_topics_history th
SET conversation_id = map.keeper_id
FROM conv_merge_map map WHERE th.conversation_id = map.dup_id;

UPDATE public.conversation_assignments ca
SET conversation_id = map.keeper_id
FROM conv_merge_map map WHERE ca.conversation_id = map.dup_id;

UPDATE public.ai_usage_logs al
SET conversation_id = map.keeper_id
FROM conv_merge_map map WHERE al.conversation_id = map.dup_id;

-- ---------------------------------------------------------------------------
-- 3. Apagar as duplicatas (ja esvaziadas) e consolidar a guardia
-- ---------------------------------------------------------------------------
DELETE FROM public.whatsapp_conversations
WHERE id IN (SELECT dup_id FROM conv_merge_map);

-- Nao lidas somadas, reabre se qualquer uma das fundidas estava ativa e herda
-- o responsavel caso a guardia estivesse sem ninguem.
UPDATE public.whatsapp_conversations c
SET unread_count = COALESCE(c.unread_count, 0) + COALESCE(a.extra_unread, 0),
    status       = CASE WHEN a.any_active THEN 'active' ELSE c.status END,
    assigned_to  = COALESCE(c.assigned_to, a.fallback_assigned),
    updated_at   = now()
FROM conv_keeper_agg a
WHERE c.id = a.keeper_id;

-- Previa e horario da ultima mensagem recalculados sobre o historico ja unido.
UPDATE public.whatsapp_conversations c
SET last_message_at      = m.ts,
    last_message_preview = LEFT(m.content, 200)
FROM (
  SELECT DISTINCT ON (msg.conversation_id)
         msg.conversation_id, msg.timestamp AS ts, msg.content
  FROM public.whatsapp_messages msg
  WHERE msg.conversation_id IN (SELECT keeper_id FROM conv_keeper_agg)
  ORDER BY msg.conversation_id, msg.timestamp DESC, msg.created_at DESC
) m
WHERE c.id = m.conversation_id;

-- ---------------------------------------------------------------------------
-- 4. A trava definitiva
-- ---------------------------------------------------------------------------
-- Se por qualquer motivo ainda restar duplicata, a criacao do indice falha e a
-- transacao inteira volta atras -- nenhum dado fica pela metade.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_instance_contact_key
  ON public.whatsapp_conversations (instance_id, contact_id);

COMMIT;
