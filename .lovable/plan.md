## Objetivo

Garantir que a nova usuária **Eduarda** tenha acesso **apenas**:
- à empresa **Denison Leandro Advocacia**
- às **2 instâncias** definidas em Configurações → Acesso a Instâncias

## Como o sistema já se comporta

O isolamento já é automático pelas regras existentes:

1. **Empresa** — no cadastro, `handle_new_user` grava `company_id` no `profiles` e `user_roles` a partir do código da empresa informado. Todas as policies RLS filtram por `company_id`, então ela nunca enxerga dados de outra empresa.
2. **Instâncias** — como Eduarda terá papel `agent`, a função `can_user_see_instance` só retorna `true` para instâncias listadas em `agent_instance_access`. Sem linhas lá, ela não vê nenhuma; com 2 linhas, vê só essas 2.

> A correção recente do `supervisor` (para ver todas as instâncias da empresa) **não afeta** `agent` — agentes continuam restritos ao `agent_instance_access`.

## Passos operacionais (sem código novo)

1. Confirmar que Eduarda foi criada com o código da empresa **Denison Leandro Advocacia** (perfil já com `company_id` correto).
2. Confirmar que a role dela é **agent** (não `admin` nem `supervisor`, senão veria todas as instâncias da empresa).
3. Em **Configurações → Acesso a Instâncias**, marcar as **2 instâncias** permitidas para ela e salvar.
4. Validação rápida via consulta:
   - `profiles.company_id` = id da Advocacia
   - `user_roles.role` = `agent`
   - `agent_instance_access` = exatamente 2 linhas para o `user_id` dela

## Fora de escopo

- Nenhuma mudança de schema, RLS, função SQL, edge function ou frontend.
- Se a role dela estiver como `admin`/`supervisor`, é preciso rebaixar para `agent` antes — a restrição por instâncias só se aplica a agentes.

Confirma que quer que eu execute a verificação (itens 1–4) agora contra o banco?
