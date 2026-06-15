UPDATE public.whatsapp_conversations c
SET status = 'closed'
WHERE c.status = 'active'
  AND c.assigned_to IS NULL
  AND COALESCE(
    (SELECT MAX(timestamp) FROM public.whatsapp_messages m WHERE m.conversation_id = c.id),
    c.created_at
  ) < (NOW() - INTERVAL '24 hours');