## Diagnóstico

A instância **escritorio-virtual** está marcada como conectada e a Evolution responde `open`, mas ela não está saudável para envio.

Evidências encontradas:
- A instância está conectada no banco e na Evolution.
- O WhatsApp conectado é `554399776600@s.whatsapp.net`, perfil **Maria Angelica**.
- Houve uma desconexão recente com motivo técnico:
  - `401 Unauthorized`
  - `Log out instance: escritorio-virtual`
- Depois de reconectar, a Evolution aceita o envio inicialmente (`send.message` com `PENDING`), mas logo depois devolve `messages.update` com `status: ERROR`.
- Nas últimas 24h, as outras instâncias da mesma empresa enviaram normalmente, mas **escritorio-virtual** teve **13 falhas em 18 envios**.
- O webhook está chegando e sendo processado; então o problema não é “mensagem não chega na plataforma”. O problema principal é que a sessão dessa instância está em estado ruim/zumbi: conectada visualmente, mas rejeitando boa parte dos envios.

## O que provavelmente está acontecendo

Essa instância ficou com uma sessão Baileys inválida após logout/401. Reconectar por cima abriu o socket, mas não limpou totalmente o estado antigo. Por isso ela aparece “conectada”, porém o WhatsApp/Evolution devolve erro de entrega logo após aceitar a mensagem.

## Plano de correção

1. **Marcar essa condição como falha real de instância**
   - Quando a plataforma receber vários `messages.update` com `status: ERROR` em poucos minutos para a mesma instância, marcar a instância como `connecting` ou `disconnected`.
   - Isso evita mostrar “conectada” quando, na prática, ela não consegue enviar.

2. **Melhorar o diagnóstico exibido no envio**
   - Salvar no erro da mensagem que a Evolution aceitou o envio, mas o WhatsApp retornou `ERROR`.
   - Mostrar uma mensagem mais clara para o usuário: “A sessão desta instância está conectada, mas rejeitando envios; remova a sessão e leia o QR Code novamente”.

3. **Criar uma rotina de recuperação segura para a instância**
   - Para esse tipo de erro 401/logout anterior, a ação correta não é só “testar conexão”.
   - A rotina deve orientar/acionar uma reconexão limpa: derrubar a sessão atual na Evolution, gerar novo QR Code e revalidar a instância.

4. **Validar webhooks da instância**
   - Confirmar que `messages.upsert`, `messages.update`, `send.message`, `connection.update`, `contacts.upsert/update` e `chats.upsert/update` continuam ativos para `escritorio-virtual`.
   - Se faltar evento, sincronizar o webhook dessa instância.

5. **Não mexer nas instâncias que estão funcionando**
   - A correção será aplicada globalmente como proteção, mas a ação de recuperação será focada na instância `escritorio-virtual`.

## Resultado esperado

- A plataforma deixa de tratar `escritorio-virtual` como saudável quando ela estiver com socket zumbi.
- O usuário passa a ver o motivo real da falha.
- A instância deve voltar a enviar depois de uma reconexão limpa/novo QR Code, sem impactar as demais instâncias.