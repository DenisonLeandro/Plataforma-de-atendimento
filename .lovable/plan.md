## Diagnóstico (confirmado)

Na instância `Acquadu` (`6d5c6a9c-…`) existem **221 contatos sem nome real** (`name` igual a `phone_number`):

- **204** são pseudo-IDs `@lid` do Baileys (números com ≥14 dígitos, ex.: `255872710213714`). O metadata deles é `{"lid": "..."}` — nunca foram resolvidos para o número real `@s.whatsapp.net`, então nenhuma consulta de perfil (`fetchProfile`) funcionou.
- **17** são números reais (ex.: `5543984365151`) que chegaram pelo webhook sem `pushName` e ficaram com o próprio telefone como nome.

Já existe uma edge function `fix-contact-names`, mas ela: (a) roda em todos os contatos de todas as instâncias, (b) chama `fetchProfile` direto — o que **falha para @lid** porque o Evolution não aceita pseudo-ID como número, e (c) sobrescreve o campo com o próprio telefone quando não vem nada, mantendo o problema.

## O que fazer (escopo mínimo)

Ajustar apenas o fluxo de recuperação de nomes — sem alterar webhook, RLS ou schema.

### 1. Atualizar `supabase/functions/fix-contact-names/index.ts`
- Aceitar `{ instanceId }` no body e filtrar contatos por essa instância (obrigatório). Sem `instanceId`, retornar 400.
- Selecionar contatos onde `name` é null/vazio **ou** `name = phone_number`, apenas da instância pedida, `is_group = false`.
- Para cada contato, escolher a estratégia pelo formato do `phone_number`:
  - **Se parecer LID** (regex `^\d{14,}$`, mesma heurística de `resolve-lid-conversations`):
    1. `POST /chat/findContacts/{identifier}` com `{ where: { id: "<phone>@lid" } }` para tentar obter o JID real (`@s.whatsapp.net`).
    2. Se resolver:
       - Se já existe outro contato na mesma instância com esse telefone real → **pular** (deixar a limpeza para o botão “Resolver conversas @lid” existente; não mexer em conversas nem apagar linhas aqui).
       - Caso contrário, atualizar `phone_number` para o número real e seguir para `fetchProfile` abaixo.
    3. Se não resolver, marcar como `unresolved` e continuar (sem sobrescrever nada).
  - **Se for número real**: chamar `POST /chat/fetchProfile/{identifier}` com `{ number: phone_number }`.
- Atualizar `name` **somente quando** vier `name` / `pushName` / `verifiedName` / `notify` **diferente** do próprio telefone. Nunca gravar o telefone como nome de novo.
- Atualizar `profile_picture_url` quando a API devolver.
- Identificar a instância corretamente (`instance_id_external` para provider `cloud`, `instance_name` para `self_hosted`) — mesma lógica de `resolve-lid-conversations`.
- Manter o gate de admin/`has_role` e o `apikey` header. Delay de ~300 ms entre chamadas.
- Retornar relatório: `{ total, updated, renamed, skipped_duplicate, unresolved, failed, details }`.

### 2. Adicionar botão no `InstanceCard.tsx`
- Novo botão “Corrigir nomes de contatos” dentro do menu de ações da instância (perto de “Resolver conversas @lid”).
- Chama `supabase.functions.invoke('fix-contact-names', { body: { instanceId: instance.id } })`.
- Toast com o resumo (atualizados / resolvidos LID / não resolvidos). Sem estado global novo — só `useState` local para loading.

### 3. Sem migrações, sem mudanças de webhook, sem tocar em RLS
Não alteramos schema, políticas, ou o pipeline de ingestão. Só uma função de correção pontual e um botão para dispará-la.

## Detalhes técnicos

- **Identificador Evolution**: `provider_type === 'cloud' ? instance_id_external : instance_name` (já é padrão do projeto — memória `Evolution API Providers`).
- **Heurística LID**: reusar `phone.length >= 14 && /^\d+$/`, alinhada com `resolve-lid-conversations`.
- **Deploy**: `fix-contact-names` já está registrado; basta atualizar o arquivo e será redeployada.
- **Autorização**: mantém `has_role(admin)` — apenas admins podem disparar.
- **Idempotência**: como só grava quando encontra nome real diferente do telefone, rodar várias vezes é seguro.

## Fora de escopo

- Não mexer no webhook (`evolution-webhook`) — corrigimos o histórico existente; novos contatos continuam entrando pelo fluxo atual.
- Não apagar/mesclar conversas — quem faz isso é `resolve-lid-conversations`, que continua disponível.
