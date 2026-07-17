# Diagnóstico

O documento existe. Foi enviado ontem 16:07 (16/07 19:07 UTC) para o Dr. Dalber:

- Arquivo: `MINUTA_DE_ACORDO_-_WANDERLEI_X_BTC_ENG.pdf` (111 KB)
- Path no Storage: `1ce45272-1241-4829-9435-6d841b959353/1784228842230-MINUTA_...pdf`
- Bucket: `whatsapp-media` (privado)

O arquivo **está no Storage**, mas ninguém consegue lê-lo. A causa é a política de SELECT do bucket `whatsapp-media`:

```
(storage.foldername(name))[1] deve ser igual a whatsapp_instances.instance_name
```

Ou seja, a policy só libera leitura se a **primeira pasta** do path for o `instance_name` (ex.: `piscinas-ibipora/...`, `desenvol/...`). Isso funciona para mídias baixadas pelo webhook (que usam esse padrão), mas **quebra para arquivos enviados pelo composer do frontend**, porque `MediaPreview.tsx` faz upload em `${user.id}/...` — um UUID de usuário que nunca bate com um `instance_name`.

Resultado: a URL assinada falha (o signer respeita RLS) e o link do documento não abre nem baixa. Vale para qualquer PDF/áudio/imagem enviado pelo usuário — não é específico do Dr. Dalber.

# Plano

## 1. Corrigir RLS do bucket `whatsapp-media` (migration)

Ampliar a policy de SELECT (e as de INSERT/UPDATE/DELETE por consistência) para aceitar **dois padrões** de prefixo, ambos escopados por empresa:

- **A. Prefixo por instância** (webhook, backfill): primeiro segmento = `instance_name` de uma `whatsapp_instances` da mesma empresa do usuário (ou super admin autorizado).
- **B. Prefixo por usuário** (upload manual do composer): primeiro segmento = `auth.uid()::text` de um profile ativo/aprovado da mesma empresa do usuário logado (compara `profiles.company_id`).

Assim, tudo que já foi enviado historicamente (incluindo o PDF do Dr. Dalber) volta a ser acessível para colegas da mesma empresa, sem vazar entre empresas.

## 2. Padronizar novos uploads do composer

Em `src/components/chat/input/MediaPreview.tsx`, mudar o path de upload de `${user.id}/...` para `${instance_name}/${user.id}/...`. Isso:

- Mantém compatibilidade com o padrão A (primeiro segmento = instance_name).
- Preserva o `user.id` como segunda pasta, para auditoria e para a policy de UPDATE existente (que valida "dono do arquivo").

Passar o `instance_name` (ou o conversationId, resolvendo para a instância) via prop até o `MediaPreview`. Ajustar `MessageInputContainer` / `MediaUploadButton` para propagar.

## 3. Ajustar policies de INSERT/UPDATE/DELETE

Reescrever para aceitar os dois prefixos, mas sempre com checagem de `company_id` (leitura e escrita só dentro da empresa). Manter comportamento de super admin com exceção explícita (`super_admin_can_write_company`).

## 4. Validação

- Abrir a conversa do Dr. Dalber como o remetente original e como outro membro da mesma empresa: o documento deve abrir e baixar.
- Enviar um novo PDF pelo composer: confirmar que o path novo é `instance_name/user_id/...` e que abre imediatamente para colegas.
- Confirmar que usuário de outra empresa continua sem acesso (URL assinada nega).

# Detalhes técnicos

- Nenhuma mudança de UI além do fluxo de upload; `MessageBubble` já usa `useSignedUrl`, então corrigida a RLS o link volta a funcionar sem alteração de componente.
- Não há necessidade de mover arquivos antigos no Storage: a policy A+B cobre o path histórico `user_id/...`.
- Sem impacto em áudio recebido/enviado pelo webhook (continua no padrão `instance_name/...`).
- Migration em `supabase/migrations/` recriando as 4 policies do bucket com a lógica combinada.
