## O que já foi feito (e é global)

A implementação anterior é para todas empresas/instâncias — não há filtro por empresa em lugar nenhum:

- `evolution-webhook` trata `messages.update` (ack 0-4) e avança o `status` da linha em `whatsapp_messages` sem retroceder.
- `send-whatsapp-message` só marca `sent` se ainda estiver `pending`/`null` (não sobrescreve `delivered`/`read`).
- `MessageBubble` mostra ⏳ / ✓ / ✓✓ / ✓✓ azul / ⚠ conforme `message.status`.

Ou seja: quando o ack chega, funciona para qualquer instância de qualquer empresa. Se não está funcionando pra você, é porque **o ack nunca chega ao webhook** — não é regra de empresa.

## Causa provável do "não funciona pra todos"

Cada instância na Evolution API tem sua própria configuração de webhook. As instâncias antigas foram criadas sem o evento `MESSAGES_UPDATE` marcado (ou com webhook desatualizado), então a Evolution simplesmente não envia os acks 1/2/3 pra nossa função — a mensagem fica travada em ✓ cinza (o `sent` que o próprio `send-whatsapp-message` grava).

Secundariamente, o Realtime precisa entregar o `UPDATE` de `whatsapp_messages` pro frontend — se a tabela não está na publicação `supabase_realtime` com `REPLICA IDENTITY FULL`, o ícone só muda ao recarregar a conversa.

## Plano de correção (global, sem toque em código de empresa)

### 1. Edge function nova: `sync-instance-webhook`

Recebe `{ instance_id }` (ou roda pra todas), busca `whatsapp_instances` + `whatsapp_instance_secrets`, e chama a Evolution:

```
POST {api_url}/webhook/set/{instance_name}
{
  "webhook": {
    "url": "<VITE_SUPABASE_URL>/functions/v1/evolution-webhook",
    "enabled": true,
    "webhookByEvents": false,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE"]
  }
}
```

- Header correto por provider (`apikey` self-hosted, `Authorization: Bearer` cloud) — reusa padrão de `evolution-helpers`.
- Retorna diagnóstico por instância (ok / erro / eventos configurados).
- Autenticação: exige usuário logado com acesso à instância (`can_user_see_instance`) OU super_admin.

### 2. Botão "Sincronizar webhook" no `InstanceCard`

- Chama a função acima pra aquela instância.
- Toast com resultado. Não muda layout, só um item no menu ou ícone pequeno ao lado de "Reconectar".
- Assim qualquer admin de qualquer empresa arruma sua própria instância em 1 clique, sem depender de super admin.

### 3. Aplicar automaticamente no fluxo já existente

- `AddInstanceDialog`: após criar a instância, chamar `sync-instance-webhook` automaticamente em vez de pedir pro usuário configurar manualmente na Evolution (mantém as instruções como fallback caso falhe).
- `reconnect-instance`: chamar `sync-instance-webhook` no mesmo passo (barato, garante que reconectada volta com eventos corretos).

### 4. Garantir Realtime de UPDATE em `whatsapp_messages`

Migration idempotente:

```sql
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
```

(Se já estiverem aplicados, o `ADD TABLE` reclama — envolvemos em `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.)

### 5. Backfill único (opcional, executado 1x)

Rodar `sync-instance-webhook` pra todas as instâncias ativas existentes, pra não depender do admin de cada empresa clicar. Feito via chamada única do super admin (Denison) ou script na própria edge function com `?all=true` restrito a super_admin.

## Fora de escopo

- Nada de mudança em RLS, em `handle_new_user`, em `get_assignable_agents`, ou qualquer coisa multi-tenant.
- Nada de mudar o mapeamento de status já existente (`STATUS_RANK`, `advanceMessageStatus`) — está correto.
- Não altero UI dos ícones — já estão no padrão pedido.

## Resumo pro usuário

O problema não é "só funcionou pra uma empresa". A lógica é global. O que falta é **avisar a Evolution API de cada instância** que ela precisa mandar o evento `MESSAGES_UPDATE` pra cá — hoje muitas instâncias antigas não mandam. Vou criar a função que faz isso, um botão pra rodar manualmente, e amarrar no fluxo de criar/reconectar instância pra nunca mais dar problema.