# Multi-Tenant Design — Plataforma de Atendimento WhatsApp

**Data:** 2026-06-29  
**Autor:** Denison Leandro  
**Status:** Rascunho — pendente implementação

---

## 1. Visão Geral

A plataforma passa a ser multi-empresa (multi-tenant). Todas as empresas compartilham a mesma URL e o mesmo banco de dados, com isolamento total entre elas via Row Level Security (RLS). O login identifica automaticamente a qual empresa o usuário pertence — modelo Netflix, sem subdomínio separado por empresa.

**Premissas:**
- Nenhuma empresa sabe da existência de outra.
- Todos os dados são escopados por `company_id` — usuários, instâncias, conversas, mensagens, macros, regras de atribuição, contatos.
- A única exceção é o super_admin, que tem visão transversal via bypass específico.

---

## 2. Hierarquia de Acesso

| Role | Escopo | Permissões |
|------|--------|------------|
| `super_admin` | Global | Vê todas as empresas. Pode "entrar" em qualquer empresa em modo leitura. NÃO pode enviar mensagens em nome de outra empresa. |
| `admin` | Por empresa | Acesso total à própria empresa. Gerencia usuários, instâncias e configurações da empresa. |
| `supervisor` | Por empresa | Gerencia escopo definido dentro da própria empresa (instâncias permitidas, agentes). |
| `agent` | Por empresa | Atende conversas atribuídas dentro da própria empresa. |

**Regra:** super_admin é uma role adicional, não substitui a role da empresa. Denison será admin da empresa "Denison Leandro Advocacia" E super_admin globalmente.

---

## 3. Tabela `companies` (nova)

```sql
CREATE TABLE public.companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text NOT NULL UNIQUE,  -- código de 6 chars, ex: "A7X9K2"
  status      text NOT NULL DEFAULT 'active', -- 'active' | 'suspended'
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

- `code` é gerado aleatoriamente pelo sistema no momento da criação da empresa.
- Não há validade ou expiração do código nesta fase.
- `status` é alterado manualmente pelo super_admin (ativa/suspende).

---

## 4. Campo `company_id` nas tabelas existentes

Todas as tabelas a seguir recebem uma coluna `company_id uuid NOT NULL REFERENCES public.companies(id)`:

| Tabela | Observação |
|--------|------------|
| `profiles` | Usuário pertence a uma empresa |
| `user_roles` | Role é escopada por empresa |
| `whatsapp_instances` | Instância pertence a uma empresa |
| `whatsapp_contacts` | Contato pertence a uma empresa |
| `whatsapp_conversations` | Conversa pertence a uma empresa |
| `whatsapp_messages` | Mensagem pertence a uma empresa (via conversa) |
| `whatsapp_macros` | Macro pertence a uma empresa |
| `assignment_rules` | Regra pertence a uma empresa |
| `agent_instance_access` | Acesso de agente é escopado por empresa |
| `conversation_assignments` | Atribuição pertence a uma empresa |

> **Observação sobre `whatsapp_messages`:** Pode herdar company_id via JOIN com a conversa, evitando coluna redundante. A decisão de performance fica para a implementação.

---

## 5. Cadastro de Usuários

### Fluxo novo de registro:
1. Tela de cadastro pede: nome completo, e-mail, senha, **código da empresa**.
2. Sistema valida o código contra a tabela `companies` (status = 'active').
3. Se inválido → erro "Código de empresa inválido ou empresa inativa."
4. Se válido → cria o usuário com `company_id` correspondente e role inicial `agent`.
5. Admin da empresa promove para supervisor/admin depois pelo painel de usuários (fluxo existente, já escopado por empresa).

### Fluxo de login (sem alteração na tela):
- Usuário entra com e-mail e senha.
- O `company_id` é lido do perfil do usuário logado — sem input extra.

---

## 6. Criação de Empresas (fluxo manual, somente super_admin)

1. Super_admin acessa o painel `/superpowers` (rota exclusiva).
2. Clica em "Nova Empresa" → preenche nome → sistema gera código aleatório de 6 caracteres.
3. Super_admin cadastra manualmente o admin inicial dessa empresa (nome, e-mail, senha temporária).
4. Super_admin vincula as instâncias WhatsApp à empresa (instâncias são configuradas na VPS pela equipe Denison).
5. Funcionários da empresa se cadastram usando o código gerado no passo 2.

---

## 7. Migração dos Dados Existentes

A empresa "Denison Leandro Advocacia" é a empresa nº 1 do sistema e recebe tratamento igual a qualquer outra empresa a partir da migração.

### Passos da migração (a executar quando for implementar):

```sql
-- 1. Criar a empresa
INSERT INTO public.companies (id, name, code, status)
VALUES (gen_random_uuid(), 'Denison Leandro Advocacia', 'DL0001', 'active')
RETURNING id; -- usar o id gerado nos UPDATEs abaixo

-- 2. Preencher company_id em todas as tabelas (UPDATE simples)
UPDATE public.profiles          SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.user_roles        SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.whatsapp_instances SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.whatsapp_contacts  SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.whatsapp_conversations SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.whatsapp_messages  SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.whatsapp_macros    SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.assignment_rules   SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.agent_instance_access SET company_id = '<id_empresa>' WHERE company_id IS NULL;
UPDATE public.conversation_assignments SET company_id = '<id_empresa>' WHERE company_id IS NULL;

-- 3. Dar role super_admin ao Denison (sem remover o admin da empresa)
-- (implementação depende de como super_admin será armazenado — campo em profiles ou tabela separada)
```

**Princípio:** nenhum dado é deletado, movido ou recriado. Apenas `company_id` é preenchido.

---

## 8. Isolamento de Dados — Princípio Geral

Todo acesso a dados passa por um filtro `company_id = auth.uid()... → profiles.company_id`. As policies RLS de cada tabela verificam:

```sql
-- Padrão para a maioria das tabelas:
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
)
```

**Super_admin bypass:** Uma função `is_super_admin()` retorna TRUE para o usuário Denison e é incluída como OR em todas as policies, permitindo leitura transversal. Para operações de escrita (INSERT/UPDATE), o bypass não se aplica fora da própria empresa.

```sql
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_super_admin = true
  );
$$;
```

> Campo `is_super_admin boolean DEFAULT false` adicionado à tabela `profiles`, ou role separada em `user_roles` — decisão de implementação.

---

## 9. Identidade Visual

- **Tela de login/cadastro:** neutra, sem logo de empresa.
- **Header da plataforma:** exibe o nome da empresa do usuário logado (campo `companies.name`).
- **Branding por empresa (logo, cores):** fora de escopo nesta fase.

---

## 10. Painel super_admin (`/superpowers`)

Rota exclusiva, acessível somente quando `is_super_admin() = true`.

### Funcionalidades:

| Funcionalidade | Descrição |
|----------------|-----------|
| Lista de empresas | Nome, código, status (ativa/suspensa), nº de usuários, nº de instâncias |
| Criar empresa | Formulário com nome → gera código automático |
| Cadastrar admin inicial | Cria usuário com role admin para uma empresa específica |
| "Entrar como" | Navega para a visão da empresa em modo visualização (read-only para ações de envio de mensagem) |
| Ativar / Suspender | Altera `companies.status` manualmente |

### "Entrar como" — modo visualização:
- O super_admin seleciona uma empresa e navega para a interface normal da plataforma, porém com um banner indicando "Você está visualizando como [empresa]".
- O envio de mensagens é bloqueado neste modo (super_admin não pode enviar mensagens em nome de outra empresa).
- O super_admin pode sair do modo visualização a qualquer momento.

---

## 11. Inteligência Artificial (IA)

- Todas as empresas usam a mesma `LOVABLE_API_KEY`.
- O custo fica centralizado em Denison (embutido no plano cobrado às empresas).
- Não há separação de chave por empresa nesta fase.

---

## 12. Bloqueio por Inadimplência

- **Não implementar** fluxo automático de cobrança ou bloqueio nesta fase.
- Denison desativa empresas manualmente via painel super_admin (`companies.status = 'suspended'`).
- Uma empresa suspensa: usuários não conseguem fazer login (policy RLS verifica status da empresa).

---

## 13. Funções SQL que Precisarão ser Atualizadas

As seguintes funções SQL existentes filtram dados sem `company_id` e precisarão ser revisadas:

| Função | Tabelas envolvidas | O que muda |
|--------|--------------------|------------|
| `can_user_see_instance` | `agent_instance_access`, `whatsapp_instances` | Adicionar filtro `company_id` |
| `can_access_conversation` | `whatsapp_conversations`, `whatsapp_instances` | Adicionar filtro `company_id` |
| `can_view_conversation` | `whatsapp_conversations` | Adicionar filtro `company_id` |
| `has_role` | `user_roles` | Adicionar filtro `company_id` |
| `get_conversation_counters` | `whatsapp_conversations` | Adicionar filtro `company_id` |
| `get_instance_names` | `whatsapp_instances` | Adicionar filtro `company_id` |

---

## 14. Edge Functions que Precisarão ser Atualizadas

Toda edge function que insere ou consulta dados precisará incluir `company_id`. As principais:

- `evolution-webhook/index.ts` — cria contatos, conversas, mensagens → precisa saber a que empresa a instância pertence e propagar o `company_id`
- `send-whatsapp-message/index.ts` — insere mensagens e consulta conversas → filtrar por `company_id`
- `generate-conversation-summary/index.ts` — consulta conversas e mensagens
- `compose-whatsapp-message/index.ts` — consulta dados da conversa
- `suggest-smart-replies/index.ts` — consulta dados da conversa

**Estratégia:** todas as edge functions que já recebem `instance_id` ou `conversation_id` podem derivar o `company_id` desses objetos. Não é necessário passar `company_id` como parâmetro externo.

---

## 15. TypeScript Types

O arquivo `src/integrations/supabase/types.ts` é **gerado automaticamente** pelo Supabase CLI (`supabase gen types`). Ele **não deve ser editado manualmente**. Após qualquer alteração de schema no banco (adicionar tabela `companies`, coluna `company_id`, etc.), o arquivo deve ser regenerado:

```bash
supabase gen types typescript --project-id <PROJECT_ID> > src/integrations/supabase/types.ts
```

---

## 16. Fora de Escopo (nesta fase)

Os seguintes itens são explicitamente excluídos do escopo atual:

- Integração de pagamento (Stripe ou outro).
- Bloqueio automático por inadimplência.
- Branding ou logo por empresa.
- Chave de IA (`LOVABLE_API_KEY`) separada por empresa.
- Validade ou limite de uso do código de empresa.
- Subdomínio por empresa (ex: empresa.plataforma.com).
- Portal self-service para criação de conta (empresa se cadastra sozinha).

---

## 17. Fases Sugeridas de Implementação

> Esta seção é referência para planejamento futuro. Não é compromisso de prazo.

### Fase 1 — Schema e migração de dados
1. Criar tabela `companies`.
2. Adicionar `company_id` a todas as tabelas.
3. Criar empresa "Denison Leandro Advocacia" e preencher `company_id` nos dados existentes.
4. Criar função `is_super_admin()`.
5. Marcar Denison como super_admin.

### Fase 2 — RLS por empresa
1. Atualizar todas as policies RLS para incluir filtro `company_id`.
2. Atualizar funções SQL auxiliares (`can_user_see_instance`, `has_role`, etc.).
3. Testar isolamento entre empresas num ambiente de staging.

### Fase 3 — Cadastro com código de empresa
1. Campo "Código da empresa" no formulário de registro.
2. Hook de validação de código.
3. Associar `company_id` ao criar usuário.

### Fase 4 — Edge functions
1. Propagar `company_id` em `evolution-webhook`.
2. Propagar `company_id` nas demais functions.

### Fase 5 — Painel super_admin
1. Rota `/superpowers` protegida.
2. CRUD de empresas.
3. Modo "entrar como" (visualização).
4. Nome da empresa no header.

### Fase 6 — Testes end-to-end
1. Criar 2 empresas de teste.
2. Verificar que dados não vazam entre elas.
3. Verificar que super_admin enxerga ambas.
4. Verificar que "entrar como" bloqueia envio de mensagens.

---

*Documento gerado em 2026-06-29. Sujeito a revisão conforme detalhes de implementação emergirem.*
