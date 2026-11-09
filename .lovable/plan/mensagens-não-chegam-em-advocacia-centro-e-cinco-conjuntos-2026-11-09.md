# Mensagens não chegam em Advocacia Centro e Cinco Conjuntos

## O que foi verificado
- Hoje, tudo o que o WhatsApp mandou para o app foi recebido e salvo. Nenhum evento ficou travado ou deu erro.
- Advocacia Centro: o último aviso chegou às 14:03 (logo depois da reconexão). Depois disso, nada.
- Cinco Conjuntos: chegou um bloco de mensagens às 13:58, logo após a reconexão. Depois disso, nada.
- Maringá e Desenvol Suporte 2 estão iguais: aparecem conectadas, mas não recebem desde cedo.
- Acquadu, Desenvol 1, Ibiporã e São Lourenço continuam recebendo normalmente.

Conclusão: o problema não está no app. A conexão no servidor do WhatsApp (Evolution) fica "adormecida": diz que está conectada, entrega as mensagens que estavam paradas logo após reconectar e depois para de mandar novas. Por isso reconectar só resolve por alguns minutos.

## Solução proposta
1. **Vigia automático de conexões adormecidas**: a cada 5 minutos o sistema compara o que o WhatsApp tem com o que o app recebeu. Se houver mensagem nova no WhatsApp que não chegou ao app, ele reinicia aquela conexão sozinho (sem QR Code).
2. **Recuperar mensagens perdidas**: no mesmo processo, as mensagens que ficaram faltando são buscadas e colocadas nas conversas certas, sem duplicar.
3. **Aviso visível**: em Configurações → Instâncias, mostrar "Sem receber há X min" e um botão "Recuperar mensagens agora".
4. **Recomendação ao servidor**: se a mesma conexão adormecer mais de 3 vezes em um dia, mostrar aviso dizendo que é preciso desconectar e ler o QR Code de novo naquele celular (às vezes a sessão no aparelho fica corrompida e só isso resolve).

## Detalhes técnicos
- Nova edge `watchdog-instances` (cron 5 min): para cada instância `connected`, chama `chat/findMessages` (últimos 15 min, via segredo já existente, sem expor chave), compara `key.id` com `whatsapp_messages.message_id`.
- Faltando mensagens: reprocessa os payloads pelo mesmo caminho de `messages.upsert` do `evolution-webhook` (reutilizando `_shared`), deduplicado por `message_id`.
- Faltando e sem eventos `messages.upsert` há >10 min: chama `instance/restart` (lógica de `reconnect-instance`) e reaplica webhook (`sync-instance-webhook`).
- Contador diário de reinícios por instância em `metadata`; acima de 3 sinaliza "requer novo QR".
- Botão manual em `InstanceCard.tsx` que invoca o mesmo watchdog para uma instância.
- Ação imediata ao aprovar: rodar a recuperação para Centro, Cinco Conjuntos, Maringá e Desenvol Suporte 2.
