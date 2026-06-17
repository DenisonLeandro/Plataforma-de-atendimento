## Remover exigência de aprovação de contas

Você está certo — essa aprovação não foi pedida. Vou desativar globalmente e aprovar todas as contas existentes para que ninguém fique travado na tela "Aguardando Aprovação".

### O que será feito

1. **Banco de dados (migração)**
   - Atualizar `project_config` para `require_account_approval = 'false'` (desliga a exigência para novas contas).
   - `UPDATE profiles SET is_approved = true WHERE is_approved IS DISTINCT FROM true` — libera todas as contas já criadas, incluindo a do DENISON que está vendo a tela agora.

2. **Frontend — esconder o toggle de aprovação**
   - Em `src/components/settings/SecuritySettings.tsx`, remover o bloco "Exigir Aprovação para Novas Contas" para não voltar a ser ligado por engano.
   - Manter o restante (restrição por domínio) intacto.

### Fora de escopo
- Não vou mexer em: regras de atribuição, Acesso a Instâncias, Evolution API, RLS de conversas, ErrorBoundary, ou qualquer outra área.
- Não vou apagar a página `/pending-approval` nem a coluna `is_approved` (ficam inertes, sem custo, caso você queira reativar no futuro).

### Resultado
Assim que a migração rodar, é só recarregar a página — você cai direto no app, sem passar pela tela de aprovação. Novos cadastros também entram direto.
