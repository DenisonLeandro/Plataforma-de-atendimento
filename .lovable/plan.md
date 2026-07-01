## Diagnóstico

O preview e o site publicado (`chat-heartbeat-57.lovable.app`) **compartilham o mesmo backend** — se um agente existe aqui, existe lá também. Então o problema não é "falta deploy", é que **Franck e Estela não aparecem no painel de Equipe da Piscinas Ibiporã**.

Consultei o banco:

| Usuário | Profile | Role | `company_id` (profiles) | `company_id` (user_roles) | `agent_instance_access` |
|---|---|---|---|---|---|
| Estela | ✅ | agent | **NULL** | **NULL** | 0 |
| Franck | ✅ | agent | **NULL** | **NULL** | 0 |

O `raw_user_meta_data` de cadastro carregava o `company_id` correto (`ab4c0aad-...`), mas as duas contas ficaram com `company_id = NULL` no `profiles` e `user_roles`. Como o painel de Equipe filtra por `company_id = <empresa do admin>`, esses agentes ficam invisíveis para o Lucas.

Duas coisas a corrigir:

## Plano

**1. Backfill dos 2 agentes:**
- Setar `profiles.company_id = 'ab4c0aad-...'` (Piscinas Ibiporã) em Estela e Franck
- Setar `user_roles.company_id = 'ab4c0aad-...'` para os mesmos
- Criar `agent_instance_access` vinculando ambos à instância `piscinas-ibipora` (para eles verem as 465 conversas)

**2. Prevenção — endurecer `handle_new_user`:**
- Trocar `ON CONFLICT (id) DO NOTHING` por `DO UPDATE SET company_id = COALESCE(public.profiles.company_id, EXCLUDED.company_id)` no INSERT do profile
- Mesmo tratamento no INSERT do `user_roles`
- Assim, se por algum motivo o profile já existir (race, retry de signup), o `company_id` do metadata ainda é gravado

## Arquivos afetados

- Migração SQL (redefinição de `handle_new_user`)
- `insert` para backfill dos 2 usuários e criação dos 2 `agent_instance_access`

Depois disso, Franck e Estela aparecem na aba **Equipe** para o Lucas em ambos os sites (preview e publicado) e conseguem ver as conversas da instância.
