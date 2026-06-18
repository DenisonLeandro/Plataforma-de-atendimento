# Fix: restaurar produção (tela branca em /whatsapp)

## Causa raiz
O commit `e970121` removeu `.env` do tracking e o adicionou ao `.gitignore`. Em stack Vite clássica da Lovable, as variáveis `VITE_*` precisam estar **no `.env` versionado** para entrar no build de produção (são inlineadas pelo Vite no momento do build, não no runtime). Sem elas:

- `src/integrations/supabase/client.ts` chama `createClient(undefined, undefined)` no top-level
- Erro de import → React nunca monta → ErrorBoundary não captura → **tela branca total**

Preview funciona porque o sandbox injeta as `VITE_*` no ambiente; produção não tem essa injeção.

## Mudanças (mínimas, só o necessário)

1. **`.gitignore`** — remover as linhas que ignoram `.env`:
   ```
   .env
   .env.local
   .env.*.local
   ```
   Manter apenas `.env.local` ignorado faria sentido em outros stacks, mas nessa stack Lovable o padrão é versionar `.env`.

2. **`.env`** — voltar a ser versionado com as três variáveis públicas que o app já usa:
   - `VITE_SUPABASE_PROJECT_ID`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (chave publishable, segura no client)
   - `VITE_SUPABASE_URL`

   Nenhum segredo privado é incluído — apenas chaves publishable, que já eram públicas anteriormente.

3. Nada mais é alterado. Nenhum código de app, nenhuma migration, nenhuma edge function, nenhuma config do Vite.

## Validação pós-fix
- Publicar (Update) e abrir `https://chat-heartbeat-57.lovable.app/whatsapp`.
- Esperado: tela de auth ou app carregando normalmente, sem branco.
- Se ainda houver branco, abrir console e reportar — passamos para H1/H3.

## Fora de escopo
- Fase 1 do LID (já commitada e não relacionada à tela branca).
- Qualquer alteração em RLS, Evolution, AuthContext, performance, aprovação de contas.
