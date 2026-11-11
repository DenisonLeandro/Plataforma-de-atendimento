# Mensagens que não chegam no Centro + edição de mensagens

## O que descobri

**1. Suas mensagens para o Escritório Centro não sumiram, estão chegando com quase 1 dia de atraso.**
Medi quanto tempo cada WhatsApp leva para entregar as mensagens ao sistema nas últimas 8 horas:

| WhatsApp | Atraso médio |
|---|---|
| Acquadu, Desenvol, Maringá, São Lourenço | na hora |
| Cinco Conjuntos | cerca de 3 horas |
| Ibiporã | cerca de 8 horas |
| **Advocacia Centro** | **cerca de 19 horas** |

O Centro só recebe um pacote pequeno de mensagens antigas (de ontem) cada vez que a conexão se renova, mais ou menos a cada 50 minutos. Por isso o seu "Oi" das 11:02 ainda não apareceu. Enviar funciona normalmente porque é outro caminho. Reiniciar não resolve: o atraso vem da fila de mensagens desse aparelho conectado, que ficou para trás.

**2. A edição não funciona porque o WhatsApp manda a edição embaralhada (criptografada).**
Hoje o sistema não consegue ler a edição, então grava uma mensagem nova escrita "Mensagem". Foi o que aconteceu com o seu "Oi" em São Lourenço. A chave para ler a edição vem junto com a mensagem original, e o sistema já guarda essa chave.

## O que vou fazer

1. **Destravar o Centro, Ibiporã e Cinco Conjuntos** (precisa de você): desconectar e conectar de novo lendo um QR Code novo pelo celular de cada escritório. Isso zera a fila atrasada e as mensagens voltam a chegar na hora. Mensagens antigas da fila podem não entrar no painel, mas continuam no celular. Vou deixar o QR pronto na tela de Instâncias e te avisar quando for escanear.
2. **Alerta automático de atraso**: o vigia vai medir o atraso de cada WhatsApp. Se passar de 15 minutos, aparece um aviso vermelho em Configurações → Instâncias: "Mensagens chegando com atraso de X — gere um novo QR Code". Assim ninguém precisa esperar alguém reclamar.
3. **Ler a edição de verdade**: o sistema vai abrir a edição com a chave da mensagem original e trocar o texto do balão original, com a marca "editada". Não vai mais criar o balão "Mensagem".
4. **Se não der para ler alguma edição**: o balão original ganha a marca "editada no celular" e nenhuma mensagem falsa é criada.
5. **Limpeza**: apagar os balões "Mensagem" falsos já criados por edições e, quando der, corrigir o texto original.

## Detalhes técnicos

- Diagnóstico: atraso medido em `whatsapp_webhook_events` comparando `created_at` com `data.messageTimestamp` dos `messages.upsert` recebidos (fromMe=false). O Centro (`advocacia-denison`) recebe só nos minutos de `connection.update open`, com `messageTimestamp` cerca de 20h mais antigo. A mensagem do Rodrigo (5543991915369 / 110316587327578@lid) não aparece em nenhum evento do Centro.
- O ciclo de cerca de 50 min de `connecting → open` acontece em todas as instâncias e não vem do nosso vigia (`watchdog_restarts_today=1`). Ele vem do servidor Evolution e não é a causa do atraso.
- Edições chegam como `messages.upsert` com `message.secretEncryptedMessage` (`secretEncType: 2` = MESSAGE_EDIT, `targetMessageKey`, `encPayload`, `encIv`). Decifrar como no esquema de voto de enquete do Baileys, com o caso de uso "Message Edit": HKDF/HMAC sobre o `messageSecret` da mensagem original (vem de `messageContextInfo.messageSecret` no evento original guardado na fila), mais id original, autor original e autor da edição, depois AES-256-GCM com `encIv`. O resultado é um `Message` protobuf com o novo texto, que entra em `applyMessageEdit` em `_shared/message-edits.ts`.
- Daqui para frente, guardar `messageSecret` em `whatsapp_messages.metadata` no momento da gravação, para não depender da fila.
- Validar a decifragem com as 17 edições reais das últimas 24h: a tag GCM confirma se a chave está certa. Adicionar teste em `tests/messageEdits.test.js`.
- `watchdog-instances`: calcular o atraso médio dos últimos upserts recebidos e gravar `metadata.delivery_lag_minutes`; com mais de 15 min, marcar `watchdog_requires_qr`. O `InstanceCard.tsx` mostra o aviso.
- Fazer deploy de `evolution-webhook` (continua público) e de `watchdog-instances`. Não precisa de migration, porque a limpeza dos balões falsos é uma alteração de dados.
