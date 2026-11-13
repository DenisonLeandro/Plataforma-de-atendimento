# Centro: por que as mensagens não chegam (e como resolver de vez)

## O que eu descobri (confirmado nos dados)

1. **As mensagens dos clientes do Centro não se perdem no WhatsApp. Elas ficam presas e só descem em "pacotes".**
   - Hoje, 32 mensagens de clientes do Centro (27 textos e 5 documentos, das 09:28 às 14:04) estão guardadas no servidor do WhatsApp, mas **nenhuma chegou ao painel**.
   - Todas entraram no servidor **ao mesmo tempo, às 11:24 (horário de Brasília)**, exatamente quando a Danielle leu o QR Code novo. Ou seja: enquanto a conexão estava "Conectada", o WhatsApp não entregava nada de cliente. As mensagens só vieram quando a conexão foi refeita.
   - Mensagens que o próprio escritório envia (pelo app ou pelo WhatsApp Web) e as confirmações de leitura chegam na hora. **Só as mensagens que os clientes mandam é que ficam presas.**

2. **O pacote que desceu às 11:24 foi ignorado pelo nosso sistema.**
   - Quando o WhatsApp entrega mensagens atrasadas depois de ler um QR Code, ele manda como "histórico", e não como "mensagem nova".
   - O nosso sistema só escuta "mensagem nova". O aviso de "histórico" nem está ligado. Por isso as 32 mensagens existem no servidor, mas não aparecem aqui.

3. **O vigia automático não percebeu.**
   - Ele só procura mensagens dos últimos 20 minutos pelo horário em que o cliente enviou. Como essas mensagens chegaram com 20 minutos a 5 horas de atraso, ficaram fora da busca.

4. **O mesmo aconteceu ontem.** Ontem o Centro leu QR novo às 08:31, recebeu normalmente por 2 horas e às 10:40 parou de receber ao vivo de novo. O **Cinco Conjuntos** tem o mesmo sintoma: tudo o que recebeu nos últimos dias chegou atrasado, nada na hora. Os outros escritórios (São Lourenço, Maringá, Ibiporã) recebem na hora.

5. **O servidor do WhatsApp derruba e religa todas as conexões a cada 50 minutos**, em todos os escritórios, o dia inteiro. Isso não vem do nosso sistema. É o servidor que roda a versão 2.3.7 da Evolution, que tem problemas conhecidos com o novo formato de identificação de contatos do WhatsApp.

**Resumindo a raiz:** em alguns números (Centro e Cinco Conjuntos), a conexão do servidor para de receber as mensagens de clientes ao vivo algumas horas depois de conectar. As mensagens só descem quando a conexão é refeita, e o nosso sistema joga fora o pacote que chega depois do QR Code.

**O que ainda não está confirmado:** por que a conexão para de receber ao vivo depois de algumas horas. A suspeita mais forte é o próprio servidor (versão antiga, religando tudo a cada 50 minutos). Isso só dá para confirmar olhando o servidor na Hostinger.

## O que vou fazer

1. **Trazer agora as 32 mensagens de hoje do Centro** (e as que faltarem em qualquer outro escritório) para dentro das conversas certas, sem duplicar.
2. **Nunca mais jogar fora o pacote de mensagens atrasadas.** Ligar o aviso de "histórico" em todos os escritórios e tratar essas mensagens como mensagens normais: aparecem na conversa, contam como não lidas e entram em "Aguardando".
3. **Corrigir o vigia automático** para procurar pelas mensagens que o servidor recebeu, mesmo que tenham sido enviadas horas antes. Também vou fazer ele olhar os escritórios que estão como "reconectando", e não só os "conectados".
4. **Aviso certo na tela:** se um escritório passar a receber as mensagens de clientes só em pacotes atrasados, aparece em Configurações → Instâncias: "Este número não está recebendo mensagens de clientes na hora".
5. **Teste real:** depois de publicar, peço para alguém mandar um "Oi" de outro celular para o Centro e confirmo que chegou na hora.

## O que precisa de alguém com acesso ao servidor (eu não consigo fazer)

- **Atualizar a Evolution** no servidor da Hostinger para a versão mais nova. As versões mais novas corrigem justamente o novo formato de contatos do WhatsApp.
- **Verificar por que o servidor religa todas as conexões a cada 50 minutos:** memória, reinícios automáticos ou mais de uma cópia do servidor rodando ao mesmo tempo.
- **Vou escrever um passo a passo** para quem cuida do servidor. Ele fica salvo como arquivo e eu te mando no final, junto com o resultado das correções.

Com os itens 1 a 4, mesmo que o servidor continue com problema, **nenhuma mensagem fica de fora do painel**: no pior caso ela chega atrasada, e o aviso mostra isso. A entrega na hora só volta de vez com o servidor corrigido.

## Detalhes técnicos

- Evidência: `chat/findMessages` mostra as mensagens de entrada de hoje do Centro com o `id` (cuid) gravado em 14:24:06 UTC, contra `messageTimestamp` entre 09:28 e 14:04 UTC. Nenhum `messages.upsert` em `whatsapp_webhook_events` e nenhuma linha em `whatsapp_messages`. O webhook da instância não assina `MESSAGES_SET`.
- `sync-instance-webhook`: adicionar `MESSAGES_SET` na lista de eventos e reaplicar em todas as instâncias.
- `evolution-webhook`: tratar `messages.set` (ou `messaging-history.set`), iterando as mensagens pelo mesmo `processMessageUpsert`, com deduplicação por `message_id` + instância. Ignorar mensagens com mais de 7 dias, para não reimportar o histórico inteiro.
- `watchdog-instances`: usar `offset` (a Evolution ignora `limit` e devolve 50), buscar as últimas ~200 mensagens e filtrar pela hora de gravação no servidor (timestamp do cuid) nos últimos 30 a 60 min, e não pelo `messageTimestamp`. Rodar também para `status in ('connected','connecting')`. Calcular `server_store_lag` (gravação menos envio). Mediana acima de 10 min nas mensagens de entrada aciona o novo aviso `inbound_batched`.
- `InstanceCard.tsx`: mostrar o aviso `inbound_batched`.
- Recuperação pontual: rodar o watchdog em modo estendido (janela de 24h) para o Centro e o Cinco Conjuntos.
- Testes: adicionar teste para o filtro por hora de gravação (cuid) e para a deduplicação de `messages.set`.
- Deploy: `evolution-webhook` (continua público), `watchdog-instances`, `sync-instance-webhook`. Sem migration.
