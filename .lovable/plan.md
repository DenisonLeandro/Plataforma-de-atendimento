## Diagnóstico

Rodei um snapshot de saúde do banco e o ranking das queries mais lentas.

**Saúde:** DB up, memória 50%, disco 52%, **conexões 44/60 (alto)**.

**Query mais lenta (grande culpada):** listagem principal de conversas por empresa, ordenada por `last_message_at`:

```
LISTA whatsapp_conversations WHERE company_id = X ORDER BY last_message_at DESC LIMIT 50
```

- Chamadas nas últimas horas: **18** — média **6,1 s** cada — total **~110 s** de CPU.
- Rodei `EXPLAIN ANALYZE` da mesma query **sem RLS**: **5 ms** (usa `idx_conv_company_lastmsg`, ótimo).

Ou seja, o índice está perfeito. A lentidão vem do **RLS**: a policy `Users can view accessible conversations` chama `can_view_conversation(auth.uid(), id)`, que é uma função **PL/pgSQL** com múltiplos `SELECT`s por linha. Como o planner não consegue inline uma função PL/pgSQL, ela executa uma vez por linha lida — em uma empresa com ~1000 conversas isso vira ~1000 chamadas de função sequenciais, cada uma abrindo cursores em `profiles`, `whatsapp_conversations`, `agent_instance_access`, `user_roles`. Resultado: 6 s por listagem, o que satura conexões (44/60) e trava tudo.

Isso é uma regressão nossa: em otimizações anteriores a função foi expandida para cobrir novos cenários (super admin, supervisores por empresa, leitura por instância) e ficou pesada demais para ser chamada por linha.

## Correção

**Reescrever `can_view_conversation` como `SQL STABLE`** para que o planner faça **inline** dentro do índice/scan (sem chamada por linha). O predicado equivalente, expresso set-based e usando as funções já STABLE (`is_super_admin`, `get_user_company_id`, `can_user_see_instance`), é:

```sql
CREATE OR REPLACE FUNCTION public.can_view_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    JOIN public.profiles p ON p.id = _user_id
    WHERE c.id = _conversation_id
      AND p.is_active AND p.is_approved
      AND (
        public.is_super_admin(_user_id)
        OR (
          c.company_id = public.get_user_company_id(_user_id)
          AND (
            public.can_user_see_instance(_user_id, c.instance_id)
            OR c.assigned_to = _user_id
          )
        )
      )
  );
$$;
```

Cobertura equivalente à versão atual:
- Super admin → visível.
- Admin/supervisor da empresa com acesso à instância → `can_user_see_instance` retorna true.
- Agente com `agent_instance_access` → `can_user_see_instance` retorna true (mesma empresa).
- Agente atribuído a uma conversa mesmo sem acesso direto à instância → `assigned_to = user`.
- Perfil inativo/não aprovado → bloqueado.

Nenhuma mudança de comportamento visível, só performance.

Também vou manter `can_access_conversation` como está (usado para escrita/atribuição — lógica mais complexa e chamada com muito menos frequência).

## Verificação após aplicar

1. Re-rodar a query top do ranking — meta: **<50 ms** com RLS.
2. Conferir `db_health` — conexões devem cair para faixa saudável em poucos minutos.
3. Se ainda houver espera, olhar a 2ª query (busca por texto em `last_message_preview`) — mas o predicado principal deve resolver 90% do problema.

## Detalhe técnico

- Nenhuma alteração de schema.
- Nenhuma alteração no frontend.
- Nenhuma alteração de policies (só a função referenciada por elas).
- Sem impacto em `evolution-webhook`, `send-whatsapp-message` e demais funções.