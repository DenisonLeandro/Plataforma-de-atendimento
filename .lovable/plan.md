## Correção: `create-company-admin` — 401 "invalid token"

Aplicar exatamente 2 trocas em `supabase/functions/create-company-admin/index.ts` e redeployar a função. Nenhum outro arquivo é tocado.

### Diff

```diff
- import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
+ import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
```

```diff
-     const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
+     const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
@@
-     const userClient = createClient(SUPABASE_URL, ANON, {
+     const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
```

### Passos

1. Aplicar as 2 substituições acima em `supabase/functions/create-company-admin/index.ts`.
2. Redeploy da função `create-company-admin`.
3. Teste via curl com o token do super_admin logado — esperado: sair do 401 `"invalid token"` e alcançar os `console.log('Step 1…')` em diante.

### Fora do escopo

- Não altero mais nada no arquivo (lógica, roles, upsert de profile permanecem).
- Não mexo em banco, RLS, migrations, config.toml ou frontend.
- Sem commit / sem push — aguardo seu OK após validar.
