## Diagnóstico

O que os atendentes descrevem como "conversa transferida vem apagada" na verdade é a **mídia** (áudio, imagem, PDF, vídeo) da conversa não carregar. Textos aparecem; o que some é todo o histórico que era áudio/imagem — e como muita coisa por WhatsApp é áudio, a conversa parece "vazia".

### Causa raiz

Na correção recente da vulnerabilidade `whatsapp_media_read_cross_company` a política de leitura do bucket `whatsapp-media` ficou com um erro no `EXISTS`:

```sql
FROM whatsapp_instances i
WHERE i.instance_name = (storage.foldername(i.name))[1]  -- ❌ i.name em vez de objects.name
      AND (i.company_id = get_user_company_id(auth.uid()) OR super_admin_can_write_company(...))
```

O correto é comparar a pasta do **arquivo** (`objects.name`) com `i.instance_name`, não a pasta do próprio nome amigável da instância. Como `whatsapp_instances.name` é "Piscinas Ibiporã" (sem `/`), `storage.foldername(i.name)[1]` retorna `NULL` para todas as linhas → a condição nunca é verdadeira → **ninguém consegue ler nenhum arquivo do bucket `whatsapp-media`** (nem da própria empresa).

Confirmado no banco:

```
instance_name        | folder_of_name (i.name) | matches
piscinas-ibipora     | NULL                    | NULL
advocacia-denison    | NULL                    | NULL
... (todas iguais)
```

Como `useSignedUrl` no cliente usa `createSignedUrl` autenticado (RLS aplica), a assinatura falha silenciosamente e o `MessageBubble` fica sem `src` → bolha de áudio em branco, imagem quebrada.

Isso afeta **todas as empresas e todas as instâncias**, não só transferências — mas fica mais visível numa transferência porque o atendente novo abre a conversa pela primeira vez e vê só bolhas vazias, sem preview antigo em cache.

Nenhuma mensagem foi apagada. Os arquivos continuam no Storage, os registros de `whatsapp_messages` continuam com `media_url` e `content`. É só a política de leitura que está bloqueando.

## Correção

### 1. Reescrever a policy de SELECT do bucket `whatsapp-media`

Substituir a política quebrada por uma que compare corretamente `(storage.foldername(objects.name))[1]` (o primeiro segmento do path do arquivo, que é o `instance_name`) com as instâncias que o usuário pode ver:

- Membro da mesma empresa da instância dona da pasta, **ou**
- Super admin com acesso explícito à empresa da instância (`super_admin_can_write_company`), **ou**
- Dono do próprio avatar (fallback para paths estilo `<user_id>/...`, se ainda existir).

A policy continua exigindo `is_active AND is_approved` e continua restrita ao próprio `company_id` — a vulnerabilidade `whatsapp_media_read_cross_company` permanece fechada.

### 2. Validar a policy antes de encerrar

Rodar uma consulta que simule: pegar 5 arquivos reais de `whatsapp-media`, extrair `foldername`, cruzar com `whatsapp_instances.instance_name` e confirmar que `matches = true` para atendentes da mesma empresa.

### 3. Invalidar cache no cliente

Não precisa de deploy nem migração de dados. Assim que a policy for corrigida:
- Sinalizar ao usuário para recarregar a página (as URLs assinadas com erro estão em cache do React Query com `gcTime` alto).
- Alternativamente, incluir no fix uma bump no `queryKey` de `useSignedUrl` para forçar refetch — opcional, um F5 resolve.

## O que **não** vou mexer

- Política do bucket `avatars` — ela também escopa por company, mas o path é `<user_id>/...` e o `EXISTS` de avatars está correto (`owner.id = foldername(objects.name)[1]`).
- Lógica de `assign_conversation`, `can_view_conversation` ou RLS de `whatsapp_messages`/`whatsapp_conversations` — testei todas e elas devolvem `true` corretamente para o destinatário da transferência. O texto do histórico já chega hoje.
- Nenhum dado será apagado, movido ou reprocessado. Só uma migração de policy.

## Detalhes técnicos

- Migração ajusta a policy `Same-company members can read whatsapp-media` (DROP + CREATE) em `storage.objects`.
- Novo predicado:
  ```sql
  bucket_id = 'whatsapp-media'
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active AND p.is_approved)
  AND EXISTS (
    SELECT 1 FROM whatsapp_instances i
    WHERE i.instance_name = (storage.foldername(objects.name))[1]
      AND (
        i.company_id = get_user_company_id(auth.uid())
        OR super_admin_can_write_company(auth.uid(), i.company_id)
      )
  )
  ```
- Sem alteração em `storage.buckets` (buckets seguem privados).
- Sem alteração em código do frontend nem em edge functions.
