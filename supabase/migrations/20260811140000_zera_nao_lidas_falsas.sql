-- Zera o contador de nao lidas SOMENTE nas conversas em que a ultima mensagem
-- foi do atendente.
--
-- Causa: quando o atendente responde pelo WhatsApp do proprio celular em vez
-- de usar a plataforma, a resposta chega pelo webhook e e gravada, mas o
-- contador de nao lidas nao era zerado. Cada mensagem seguinte do cliente
-- somava +1 sem nunca voltar a zero -- escritorios acumularam mais de 150
-- conversas "nao lidas" que ja tinham sido respondidas.
--
-- ESCOPO DELIBERADAMENTE ESTREITO:
--   * NAO encerra nenhuma conversa
--   * NAO altera status, responsavel nem qualquer outro campo
--   * NAO toca em conversa cuja ultima mensagem e do cliente -- essa e a fila
--     de verdade, tem gente esperando resposta, e esconder isso seria o pior
--     resultado possivel
--
-- A unica coisa que muda e o numero da bolinha, e so onde ele e comprovadamente
-- falso. Se o cliente escrever depois, o webhook volta a somar normalmente.
--
-- Idempotente: rodar de novo nao encontra nada para corrigir.

BEGIN;

-- O gatilho archive_topics_before_update dispara em QUALQUER update de conversa
-- e grava uma linha em whatsapp_topics_history sempre que a conversa tem
-- topicos -- mesmo quando os topicos nao mudaram. Como esta migration atualiza
-- centenas de conversas, ele inflaria os relatorios de topicos com centenas de
-- linhas falsas. Desligamos apenas este gatilho, e apenas aqui dentro: em
-- Postgres o DISABLE TRIGGER e transacional, entao qualquer falha no meio do
-- caminho reativa o gatilho junto com o rollback.
ALTER TABLE public.whatsapp_conversations DISABLE TRIGGER archive_topics_before_update;

-- Conferencia: separa o que sera corrigido do que sera preservado, usando
-- exatamente o mesmo criterio do UPDATE abaixo.
DO $$
DECLARE
  v_falsas    integer;
  v_falsas_qt integer;
  v_reais     integer;
  v_reais_qt  integer;
BEGIN
  WITH ultima AS (
    SELECT DISTINCT ON (m.conversation_id)
           m.conversation_id, m.is_from_me
    FROM public.whatsapp_messages m
    WHERE m.conversation_id IN (
      SELECT id FROM public.whatsapp_conversations WHERE unread_count > 0
    )
    ORDER BY m.conversation_id, m.timestamp DESC, m.created_at DESC
  )
  SELECT
    count(*) FILTER (WHERE u.is_from_me IS TRUE),
    COALESCE(SUM(c.unread_count) FILTER (WHERE u.is_from_me IS TRUE), 0),
    count(*) FILTER (WHERE u.is_from_me IS NOT TRUE),
    COALESCE(SUM(c.unread_count) FILTER (WHERE u.is_from_me IS NOT TRUE), 0)
  INTO v_falsas, v_falsas_qt, v_reais, v_reais_qt
  FROM public.whatsapp_conversations c
  JOIN ultima u ON u.conversation_id = c.id
  WHERE c.unread_count > 0;

  RAISE NOTICE 'Serao zeradas (atendente respondeu por ultimo): % conversas, % pendencias', v_falsas, v_falsas_qt;
  RAISE NOTICE 'Serao PRESERVADAS (cliente esperando): % conversas, % pendencias', v_reais, v_reais_qt;
END $$;

UPDATE public.whatsapp_conversations c
SET unread_count = 0,
    updated_at   = now()
FROM (
  -- Ultima mensagem de cada conversa que hoje tem pendencia.
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         m.is_from_me
  FROM public.whatsapp_messages m
  WHERE m.conversation_id IN (
    SELECT id FROM public.whatsapp_conversations WHERE unread_count > 0
  )
  ORDER BY m.conversation_id, m.timestamp DESC, m.created_at DESC
) ultima
WHERE c.id = ultima.conversation_id
  AND ultima.is_from_me IS TRUE   -- a linha que protege a fila real
  AND c.unread_count > 0;

ALTER TABLE public.whatsapp_conversations ENABLE TRIGGER archive_topics_before_update;

COMMIT;
