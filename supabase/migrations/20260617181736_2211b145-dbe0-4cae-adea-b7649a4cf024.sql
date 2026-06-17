UPDATE public.whatsapp_instance_secrets
SET api_url = regexp_replace(api_url, '/manager/?$', '')
WHERE api_url ~ '/manager/?$';