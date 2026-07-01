# Fase 1 — Multi-Tenant no Banco de Dados

Vou aplicar em **uma única migration** (transacional) toda a estrutura multi-tenant, sem apagar nada. Todos os dados atuais passam a pertencer à empresa **Denison Leandro Advocacia**.

## O que a migration faz (em ordem)

1. **Criar tabela `companies`** (`id`, `name`, `code` único, `status`, `created_at`) com RLS: super_admin vê todas, demais só a própria.
2. **Adicionar valor `super_admin`** no enum `app_role`.
3. **Adicionar coluna `company_id` (nullable, FK → companies)** em: `profiles`, `user_roles`, `whatsapp_instances`, `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_macros`, `assignment_rules`, `agent_instance_access`, `conversation_assignments`.
4. **Criar empresa Denison Leandro** (id fixo `00000000-...-0001`, code `DLA001`) e fazer `UPDATE` em todas as 10 tabelas atribuindo esse company_id a linhas onde `company_id IS NULL`.
5. **Conceder role `super_admin`** ao Denison (`1ce45272-1241-4829-9435-6d841b959353`) sem remover a role `admin` atual.
6. **Criar funções auxiliares** `get_user_company_id()`, `is_super_admin()`, `generate_company_code()` (SECURITY DEFINER).
7. **Atualizar `can_user_see_instance`** para: super_admin vê tudo; admin vê tudo da própria empresa; supervisor/agent via `agent_instance_access`.
8. **Recriar policies RLS** (DROP IF EXISTS + CREATE) nas 10 tabelas, adicionando filtro por `company_id` em cima das regras de role existentes. Destaques:
   - `whatsapp_macros` e `assignment_rules`: hoje têm policies "allow all" — serão substituídas por policies com filtro de empresa.
   - `whatsapp_conversations` / `whatsapp_messages`: SELECT continua via `can_view_conversation`/`can_access_conversation` (que já filtram por empresa via `can_user_see_instance`). Apenas INSERT recebe filtro explícito.
   - `can_access_conversation` e `can_view_conversation` **não são alteradas** — a filtragem por empresa entra pela cadeia via `can_user_see_instance`.
9. **Atualizar `get_conversation_counters`** para incluir `is_super_admin OR company_id = get_user_company_id(auth.uid())`.
10. **Atualizar trigger `handle_new_user`** para ler `new.raw_user_meta_data->>'company_id'` e gravar em `profiles.company_id` (fica `NULL` se não vier — cadastros legados).
11. **Criar índices** `idx_*_company_id` nas 10 tabelas + `idx_companies_code`.
12. **Grants**: `GRANT SELECT ON companies TO authenticated`, `GRANT ALL ON companies TO service_role`, `GRANT EXECUTE` nas 3 novas funções conforme especificado. Todos os grants existentes preservados.

## Regras respeitadas

- Nenhum `DROP TABLE`, `DROP COLUMN` ou `DELETE`.
- `company_id` fica **nullable** nesta fase (backfill primeiro; `NOT NULL` só numa fase futura).
- Supervisor **não** ganha bypass global — regra atual mantida.
- Edge functions (service_role) continuam funcionando sem alteração.
- Frontend / cor laranja: intocados nesta fase.

## Verificação pós-migration

Após você aprovar e a migration rodar, executo as 7 queries de verificação que você listou (contagem de `company_id IS NULL`, roles do Denison, `is_super_admin`, `get_user_company_id`) e devolvo os resultados.

## Fora desta fase (próximas)

- Frontend de cadastro passando `company_id` no `signUp` metadata.
- Tela de super_admin para gerenciar empresas.
- Tornar `company_id` `NOT NULL` após validação.
- Ajustes em edge functions para propagar `company_id` em inserts.

Ao aprovar, aplico tudo em uma migration única.