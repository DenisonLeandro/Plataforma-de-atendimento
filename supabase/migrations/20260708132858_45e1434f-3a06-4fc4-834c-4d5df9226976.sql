
-- Separate agent reactions (from platform) from contact reactions (from webhook)
ALTER TABLE public.whatsapp_reactions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop old unique that mixed both
ALTER TABLE public.whatsapp_reactions
  DROP CONSTRAINT IF EXISTS unique_reaction_per_message;

-- Partial uniques: one per (message, agent) and one per (message, external jid)
CREATE UNIQUE INDEX IF NOT EXISTS unique_reaction_per_message_user
  ON public.whatsapp_reactions (message_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_reaction_per_message_jid
  ON public.whatsapp_reactions (message_id, reactor_jid)
  WHERE user_id IS NULL;
