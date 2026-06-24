O erro não parece ser status visual da plataforma: o log do envio mostra que a própria Evolution respondeu `400 Bad Request` com `Error: Connection Closed` no endpoint `/message/sendText/advocacia-denison`. Ou seja: a instância aparece conectada, mas o socket interno usado para enviar está fechado/intermitente.

Plano de correção:

1. Ajustar `send-whatsapp-message`
   - Antes de enviar, checar `connectionState` da instância.
   - Se a Evolution disser `close/closed`, tentar `connect` uma vez e retornar uma mensagem clara pedindo reconexão/QR se necessário.
   - Se o envio retornar `Connection Closed`, não tratar como erro genérico: sincronizar a instância como `connecting` ou `disconnected` conforme o estado real e devolver uma mensagem amigável.

2. Adicionar recuperação automática no envio
   - Quando receber `Connection Closed`, chamar uma verificação/reconexão leve e tentar reenviar a mensagem uma única vez após curto intervalo.
   - Se ainda falhar, preservar a mensagem como não enviada e orientar o usuário a usar “Reconectar/Testar conexão”.

3. Melhorar a mensagem do erro no frontend
   - Trocar o toast técnico `Evolution API (400): ...` por algo como: “A Evolution informou que o socket da instância fechou. Tente reconectar a instância e envie novamente.”

4. Causa provável e prevenção
   - A causa provável é instabilidade/bug de sessão Baileys na Evolution self-hosted: há relatos do mesmo erro com instância aparecendo `connected/open` mas `/message/sendText` falhando com `Connection Closed`.
   - Para reduzir recorrência, a plataforma passará a validar e recuperar no momento do envio; no servidor Evolution, o ajuste recomendado é revisar/atualizar a variável `CONFIG_SESSION_PHONE_VERSION`, atualizar a Evolution e reiniciar/reconectar a instância quando necessário.

Arquivos a alterar:
- `supabase/functions/send-whatsapp-message/index.ts`
- Possivelmente o componente/hook que exibe o toast de falha de envio, se a mensagem vier crua do backend.