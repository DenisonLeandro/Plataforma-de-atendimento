## Parte 1 — Encerrar conversas antigas da Desenvol Informática

Marcar como `closed` todas as conversas da empresa **Desenvol Informática** (2 instâncias: `Desenvol Suporte 1` e `Desenvol Suporte 2`) cuja `last_message_at` seja anterior a **2026-07-12 00:00 (America/Sao_Paulo)**, mantendo abertas apenas as de 13/07 em diante.

- Afetadas hoje: **85 conversas** hoje em `active` seriam encerradas.
- Conversas com `last_message_at >= 2026-07-12` permanecem intactas.
- Operação via `UPDATE` restrito por `company_id = d68c2a97-…`.

## Parte 2 — Auditoria de vazamento entre empresas

Analisei todas as políticas RLS relevantes (`whatsapp_conversations`, `whatsapp_messages`, `whatsapp_contacts`, `whatsapp_macros`, `whatsapp_instances`, `profiles`, `user_roles`, `agent_instance_access`, `assignment_rules`, `conversation_assignments`) e as funções `can_view_conversation`, `can_user_see_instance`, `get_assignable_agents`, `get_conversation_counters`.

**Resultado — pontos sólidos:**
- Leitura/escrita de conversas, mensagens, contatos, macros, regras e instâncias já são estritamente por `company_id` (com exceção documentada do super admin com acesso explícito via `super_admin_company_access`).
- `get_assignable_agents` já filtra pela empresa da instância (agentes de outras empresas não aparecem na tela de transferir).
- Storage (`avatars`, `whatsapp-media`) já validado por company em correções anteriores.

**Vazamento potencial identificado — 1 item:**

### F1. `assign_conversation` aceita destinatário de outra empresa
A função `public.assign_conversation(_conversation_id, _assigned_to, _reason)` valida apenas que o destinatário seja um agente/admin/supervisor **ativo em qualquer empresa**. O comentário no código diz explicitamente "Transferência é cross-instância … NÃO exige acesso à instância". Isso significa que, mesmo com o dropdown da UI filtrado corretamente, uma chamada RPC direta (via console, script ou cliente adulterado) permitiria transferir uma conversa da Desenvol para, por exemplo, um agente da Advocacia.

**Correção proposta:** exigir que o destinatário pertença à mesma empresa da conversa (ou seja super admin com acesso explícito àquela empresa via `super_admin_company_access`). Sem migration de tabelas — só redefinir a função.

```text
IF _assigned_to IS NOT NULL:
  destino_company := profiles.company_id do _assigned_to
  conversa_company := whatsapp_conversations.company_id da conversa
  Permitir se:
    destino_company = conversa_company
    OU super_admin_can_write_company(_assigned_to, conversa_company)
  Caso contrário: RAISE 'Atendente de outra empresa não permitido'
```

## Execução

1. **Migration** — redefinir `public.assign_conversation` com validação de mesma empresa.
2. **Update de dados** (via `supabase--insert`) — fechar as 85 conversas da Desenvol anteriores a 12/07 (`last_message_at < '2026-07-12 03:00:00+00'`, equivalente a 00:00 America/Sao_Paulo).
3. Sem alterações de frontend — a UI já respeita o filtro por empresa; o reforço é apenas defesa em profundidade no backend.
