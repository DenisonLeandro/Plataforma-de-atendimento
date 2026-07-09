CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cobre listagem principal: WHERE company_id = ? ORDER BY last_message_at DESC NULLS LAST
CREATE INDEX IF NOT EXISTS idx_conv_company_lastmsg
  ON public.whatsapp_conversations (company_id, last_message_at DESC NULLS LAST);

-- Cobre filtros por status (abertas/encerradas) dentro da empresa
CREATE INDEX IF NOT EXISTS idx_conv_company_status_lastmsg
  ON public.whatsapp_conversations (company_id, status, last_message_at DESC NULLS LAST);

-- Trigram para ilike em nome/telefone (busca de contatos)
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON public.whatsapp_contacts USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm
  ON public.whatsapp_contacts USING gin (phone_number gin_trgm_ops);

ANALYZE public.whatsapp_conversations;
ANALYZE public.whatsapp_contacts;