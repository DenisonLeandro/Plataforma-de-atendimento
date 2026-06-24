## Diagnóstico

O erro persistente de tela branca é compatível com uma falha de inicialização do cliente de backend no primeiro carregamento do JavaScript.

O ponto crítico está em `src/integrations/supabase/client.ts`: o app cria o cliente usando `import.meta.env.VITE_SUPABASE_URL` e `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`. Se qualquer uma dessas variáveis não entra no build publicado, a biblioteca lança erro antes do React montar a interface, resultando em tela branca.

O que encontrei:
- A `.env` existe localmente e contém as variáveis necessárias.
- A `.gitignore` atualmente ignora `.env`, `.env.local` e `.env.*.local`.
- Em projetos Vite clássicos, isso pode fazer o build publicado sair sem as variáveis `VITE_SUPABASE_*`, mesmo que o preview funcione.
- A captura enviada mostra um erro de console ao tentar usar `window.supabase.rpc(...)`; isso não é a causa principal, porque o projeto não expõe `supabase` em `window`. O teste correto teria que usar o cliente importado pelo bundle ou verificar as requisições reais.
- O sintoma anterior `supabaseUrl is required` aponta diretamente para `VITE_SUPABASE_URL` ausente no bundle publicado.
- Tentei inspecionar o domínio publicado, mas ele retornou `403 Forbidden` para a requisição direta no sandbox; ainda assim, o código local e o histórico do erro indicam a mesma raiz: build publicado sem configuração de backend embutida.

## Causa provável

A plataforma parou de aparecer porque o bundle publicado foi gerado em um estado onde `VITE_SUPABASE_URL` e/ou `VITE_SUPABASE_PUBLISHABLE_KEY` estavam ausentes. Como o cliente backend é inicializado no topo do módulo, a exceção acontece antes da renderização de qualquer rota, inclusive `/auth`, `/whatsapp` e telas de fallback.

## Plano de correção

1. **Corrigir a fonte do problema de build**
   - Remover as regras que ignoram `.env` da `.gitignore` para que as variáveis públicas `VITE_SUPABASE_*` sejam consideradas no fluxo de build do projeto.
   - Manter ignorados somente arquivos locais/sensíveis apropriados, sem bloquear a `.env` gerenciada do app.

2. **Adicionar proteção contra tela branca definitiva**
   - Criar um pequeno módulo de validação de ambiente antes da criação do cliente backend.
   - Se as variáveis estiverem ausentes, renderizar uma tela de erro clara em vez de quebrar o bundle inteiro.
   - A mensagem será voltada para recuperação operacional, sem expor chaves ou segredos.

3. **Evitar crash na inicialização do React**
   - Ajustar `src/integrations/supabase/client.ts` para validar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` antes de chamar `createClient`.
   - Preservar o import existente `import { supabase } from "@/integrations/supabase/client"` para não refatorar o app inteiro.

4. **Validar no preview**
   - Confirmar que o app renderiza normalmente em `/whatsapp` quando as variáveis existem.
   - Confirmar que não há erro de console relacionado a `supabaseUrl is required`.

5. **Republicar após a correção**
   - Depois da implementação, o app precisa ser publicado novamente para gerar um bundle novo com as variáveis corretas.
   - Depois disso, fazer hard refresh no domínio publicado para eliminar o bundle antigo em cache.

## Resultado esperado

A plataforma volta a aparecer no preview e no publicado. Mesmo que ocorra alguma falha futura de configuração de ambiente, o usuário verá uma tela de diagnóstico em vez de tela branca.