## Problema

O `CardFooter` do `InstanceCard.tsx` tem 7 botões + um texto de progresso em uma única linha `flex gap-2` sem quebra. Em cards estreitos (grid multi-coluna), os botões estouram a largura do card, ficando cortados/fora do bloco (como mostra a imagem do card "Advocacia Cinco Conjuntos").

## Correção

Ajustar apenas o `CardFooter` para que os botões se enquadrem corretamente dentro do card em qualquer largura.

### Mudanças em `src/components/settings/InstanceCard.tsx`

1. **Footer com wrap e alinhamento**
   - Trocar `className="flex gap-2"` do `CardFooter` por `className="flex flex-wrap items-center gap-2"`.
   - Isso permite que os botões quebrem para a linha de baixo em vez de vazarem.

2. **Botões com tamanho fixo e consistente**
   - Padronizar cada `<Button size="sm">` de ação (ícone) com `className="h-9 w-9 p-0 shrink-0"` para virarem quadrados iguais e nunca encolherem/esticarem.
   - Mantém os mesmos ícones/tooltips atuais.

3. **Texto de progresso da sincronização**
   - O `<span>` "Sincronizando… X conv. / Y msgs / Z contatos" hoje fica no meio dos botões. Passar para depois de todos os botões e envolver em um contêiner `w-full` para quebrar para a linha de baixo:
     `<div className="w-full text-xs text-muted-foreground">…</div>`.
   - Assim o texto nunca empurra os botões para fora do card.

Nenhuma alteração de lógica, permissões, dados ou de outros componentes.
