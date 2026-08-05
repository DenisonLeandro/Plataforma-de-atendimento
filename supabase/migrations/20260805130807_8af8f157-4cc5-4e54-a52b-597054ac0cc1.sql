UPDATE public.whatsapp_instances
SET status = 'disconnected',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('connecting_streak', 3, 'recovery_hint', 'Sessao perdida em 31/07 - leia o QR Code para reconectar.'),
    updated_at = now()
WHERE id = '8afa17f0-5d18-4ac3-ace7-b0d573dfec8c';