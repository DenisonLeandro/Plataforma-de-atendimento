## Ainda o mesmo erro no upsert de `whatsapp_contacts`

Confirmei via network log: request `POST /rest/v1/whatsapp_contacts?on_conflict=instance_id%2Cphone_number` com body `{instance_id, phone_number: 5543984933258, name: "Lucas"}` retorna `42501`. Já existe um contato com esse par `(instance_id, phone_number)` — id `5e2cd06d…`, company `001`, com uma conversa vinculada — então o PostgREST usa o caminho `ON CONFLICT DO UPDATE`. As policies novas de `whatsapp_contacts` estão exatamente como o plano anterior previu: INSERT e UPDATE agora permitem agentes com `can_user_see_instance` / `can_view_conversation`, e Eduarda satisfaz todos os predicados quando avaliados individualmente. Ainda assim o Postgres nega.

Como não consigo assumir o papel `authenticated` a partir do exec do sandbox, preciso reproduzir o erro dentro do próprio Postgres com o `auth.uid()` da Eduarda para descobrir qual predicado retorna false.

## Diagnóstico proposto (temporário, reversível)

1. Criar função `public._diag_upsert_contact()` SECURITY DEFINER que:
   - Faz `SET LOCAL role authenticated`.
   - Faz `SET LOCAL "request.jwt.claims"` com `sub = 1e9affd3-…` (Eduarda).
   - Executa o mesmo `INSERT … ON CONFLICT (instance_id, phone_number) DO UPDATE SET name = EXCLUDED.name` da requisição real.
   - Captura e retorna `SQLSTATE`/`SQLERRM` num JSONB.
2. Rodar a função via `supabase--read_query` (SELECT) e ler o erro exato.
3. Além disso, avaliar isoladamente, dentro da mesma função, cada sub-expressão usada nas policies (`can_user_see_instance`, `can_view_conversation`, `super_admin_can_write_company`, `get_user_company_id`) sob o contexto simulado — para localizar qual retorna null/false.
4. Com base no resultado, aplicar a correção real (pode ser: `SECURITY DEFINER` faltando em algum helper, `search_path`, ou algum predicado que retorna null em vez de false por causa de linha inexistente).
5. Ao final, `DROP FUNCTION public._diag_upsert_contact();` — nada temporário fica no schema.

Este diagnóstico é executado como uma única migration criando a função, depois consultas SELECT invocando-a, e finalmente uma migration de cleanup + a correção real assim que a causa raiz for identificada.

## Nada muda no frontend nesta etapa

Só depois de saber qual predicado falha eu proponho a correção definitiva (que pode ser em RLS, em uma função helper, ou no hook `useCreateConversation`).
