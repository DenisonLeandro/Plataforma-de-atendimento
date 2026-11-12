# Aviso de atraso do Centro continua depois do QR Code novo

## O que encontrei
- O QR Code novo do Centro funcionou: às 08:31 (horário de Brasília) a conexão foi refeita do zero e ficou "Conectado".
- O aviso vermelho ("atraso de 17 horas") é **antigo**. Ele foi calculado com as mensagens atrasadas que chegaram antes do QR novo (às 07:00 e 07:50, com mensagens de ontem às 12:00).
- Depois do QR novo, ainda não chegou nenhuma mensagem de cliente pelo caminho normal. Sem mensagens novas, o vigia não tem como medir de novo e mantém o último valor. Por isso o aviso não some.
- Ou seja: o aviso não prova que o atraso continua. Ainda não dá para saber se está resolvido, porque nenhuma mensagem nova chegou desde o QR.

## O que vou fazer
1. **Apagar o aviso do Centro agora**, já que ele se refere à conexão antiga.
2. **Zerar o aviso automaticamente a cada QR Code novo**: quando um WhatsApp é ligado de novo pelo QR, o sistema esquece a medição antiga e mostra "Verificando a conexão nova…" até chegarem mensagens novas.
3. **Medir só mensagens que chegaram depois do QR novo**, para que mensagens atrasadas da conexão antiga não façam o aviso voltar.
4. Se o atraso aparecer de novo com mensagens novas, o aviso vermelho volta normalmente.

## Depois de aplicar
- Peça para alguém mandar um "Oi" de outro celular para o Centro e veja se chega na hora no painel.
- Se chegar na hora, está resolvido. Se não chegar em poucos minutos, me avise: aí o problema está no servidor do WhatsApp (Evolution), e não no aviso.

## Detalhes técnicos
- `evolution-webhook`: no `connection.update` com `state=open` vindo depois de `qrcode.updated` (ou após `reconnect-instance` com `clean: true`), gravar `metadata.lag_reset_at = now()`, remover `delivery_lag_minutes` e definir `watchdog_requires_qr = false` (mantendo o critério de reinícios/dia).
- `reconnect-instance` com `clean: true`: também grava `lag_reset_at` e limpa o aviso.
- `watchdog-instances`: amostras de atraso com `created_at >= max(now-2h, lag_reset_at)`; sem amostras depois do reset, não herda `delivery_lag_minutes` antigo.
- `InstanceCard.tsx`: se `lag_reset_at` existe e ainda não há medição nova, mostrar estado neutro "Verificando a conexão nova…" em vez do aviso vermelho.
- Atualização pontual de dados: limpar `delivery_lag_minutes`/`watchdog_requires_qr` de `advocacia-denison` e gravar `lag_reset_at` = horário do `open` de 11:31 UTC.
- Deploy: `evolution-webhook` (continua público), `reconnect-instance`, `watchdog-instances`. Sem migration.
