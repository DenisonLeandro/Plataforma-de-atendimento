## Plano

1. Confirmar o ponto exato da quebra no frontend
   - O erro visível é `supabaseUrl is required`, disparado na inicialização do cliente do backend.
   - Isso faz o React falhar antes de renderizar a plataforma, resultando na tela branca.

2. Corrigir a configuração do cliente backend
   - Ajustar o uso das variáveis públicas do backend para garantir que o cliente receba URL e chave válidas.
   - Não alterar lógica de negócio, RLS, tabelas ou edge functions.
   - Não editar o arquivo auto-gerado `src/integrations/supabase/client.ts`; se necessário, corrigir a origem/configuração esperada pelo app ou os pontos de uso seguros no frontend.

3. Revisar chamadas diretas que dependem dessas mesmas variáveis
   - Conferir `AuthContext`, sincronização do WhatsApp e componentes de instância que montam URLs de functions/webhooks.
   - Garantir que essas chamadas não construam URLs inválidas quando a variável pública não estiver disponível.

4. Validar a recuperação da tela
   - Abrir a rota `/whatsapp` no preview autenticado.
   - Verificar que a plataforma volta a renderizar e que o console não mostra mais `supabaseUrl is required`.

## Resultado esperado

A plataforma deixa de ficar em tela branca e volta a carregar normalmente, sem mudanças em banco, permissões, RLS ou functions.