## Plano para recuperar a plataforma

1. **Confirmar a causa da tela branca**
   - Reproduzir em `/whatsapp` no ambiente local/publicado e coletar console/network do carregamento inicial.
   - Verificar se o HTML/JS está carregando e se o erro acontece no React antes da UI renderizar.

2. **Isolar o arquivo responsável**
   - Priorizar os pontos que envolvem o último ajuste aprovado: `DisconnectedInstancesBanner.tsx`, `WhatsApp.tsx` e providers globais.
   - Checar também erros de runtime em componentes globais (`App.tsx`, `AuthContext`, `ProtectedRoute`, `sonner`) caso o crash aconteça antes da rota.

3. **Aplicar correção mínima**
   - Se o problema for causado pelo banner/última alteração, ajustar apenas esse componente sem mexer em backend, RLS, migrations, edge functions ou regras de conversa.
   - Se o problema for outro erro de frontend que impede renderização, corrigir somente o trecho necessário para a plataforma voltar a aparecer.

4. **Validar**
   - Abrir `/whatsapp` após o ajuste e confirmar que a interface renderiza novamente.
   - Confirmar que o botão de fechar o banner continua funcionando se houver instâncias desconectadas.

## Restrições mantidas

- Não tocar em RLS, banco, migrations ou edge functions.
- Não tocar em `useCreateConversation`, `can_view_conversation`, `can_access_conversation`.
- Não alterar cor laranja.
- Não fazer auto-auditoria.
- Não comitar nem dar push sem aprovação explícita.