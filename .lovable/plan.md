# Suporte 1 (Desenvol) parou de receber mensagens desde 31/07

## O que os dados mostram

Consultei o banco da instância **Desenvol Suporte 1** (`desenvol`):

- Última mensagem gravada: **31/07/2026** (176 msgs no dia; nos dias anteriores 400-700/dia).
- Última entrada na fila de eventos do webhook (`whatsapp_webhook_events`) para `desenvol`: **31/07 13:58** — nenhum evento depois disso, de nenhum tipo.
- O último evento de conexão recebido foi `connection.update` com estado **"connecting"**.
- No banco a instância está marcada como `connected` (atualizada hoje 12:56 pela verificação periódica de status).
- A Suporte 2 (`desenvol-suporte`) continua recebendo normalmente.

Conclusão: não é problema de permissão nem de perfil da usuária — **a Evolution API parou de entregar webhooks dessa instância**. O cenário típico: durante a reconexão de 31/07 a configuração de webhook da instância `desenvol` foi perdida/desativada no servidor Evolution (acontece ao recriar/reiniciar a instância). A verificação de status usa outra rota (`connectionState`), por isso ela aparece "conectada" mesmo sem webhooks.

Isso ainda não está 100% confirmado do lado da Evolution — o primeiro passo do plano é justamente ler a configuração atual de webhook da instância.

## Plano

1. **Diagnóstico confirmatório (leitura na Evolution)**
   Estender a função `diagnose-instance` para também consultar `GET /webhook/find/{instance}` e retornar: URL configurada, `enabled` e lista de eventos. Assim vemos objetivamente se o webhook está ausente, desabilitado, apontando para URL errada ou sem os eventos `MESSAGES_UPSERT`.

2. **Correção**
   - Se o webhook estiver ausente/errado: reaplicar via a função já existente `sync-instance-webhook` (que grava URL + os 9 eventos corretos).
   - Se estiver correto mas o socket estiver realmente caído (`state != open`): reconectar via `reconnect-instance` / QR Code no card da instância.

3. **Recuperar o histórico perdido (31/07 → hoje)**
   Rodar a sincronização de histórico (`sync-whatsapp-history`) para a instância `desenvol`, trazendo as conversas/mensagens que chegaram enquanto o webhook estava mudo.

4. **Prevenir reincidência**
   - No `check-instances-status`, além de checar `connectionState`, verificar o webhook da instância e, se estiver ausente/desabilitado, reaplicá-lo automaticamente.
   - Sinalizar no card da instância um alerta "sem eventos recebidos há mais de X horas" (baseado no último `whatsapp_webhook_events` da instância), para o problema ficar visível em vez de silencioso.

## Detalhes técnicos

- Instância: `Desenvol Suporte 1`, `instance_name = desenvol`, id `8afa17f0-5d18-4ac3-ace7-b0d573dfec8c`, provider `self_hosted`.
- Arquivos envolvidos: `supabase/functions/diagnose-instance/index.ts`, `supabase/functions/check-instances-status/index.ts`, `src/components/settings/InstanceCard.tsx`; reuso sem alteração de `sync-instance-webhook` e `sync-whatsapp-history`.
- Nenhuma mudança de schema é necessária; o alerta de "silêncio" usa `max(created_at)` de `whatsapp_webhook_events` por instância.
