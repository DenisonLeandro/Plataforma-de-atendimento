## Problema

Leandro é `admin` local da Desenvol Informática (não é super admin) e mesmo assim aparece a barra laranja "Visualizando como: Desenvol Informática — MODO SOMENTE LEITURA".

Causa: em `AuthContext.tsx` o estado `viewingAsCompanyId` é lido diretamente do `sessionStorage` na inicialização e `isViewingAsCompany = !!viewingAsCompanyId`, sem checar se quem está logado é super admin. Como o `sessionStorage` persiste entre logouts/logins no mesmo tab, um valor deixado por uma sessão anterior de super admin acaba "vazando" para o Leandro, que fica travado em modo somente leitura.

## Correção

Em `src/contexts/AuthContext.tsx`:

1. Derivar `isViewingAsCompany` como `isSuperAdmin && !!viewingAsCompanyId` — usuário não super admin nunca dispara a UI de view-as, nem o banner, nem o `isReadOnlyView`.
2. Adicionar um efeito que limpa `viewingAsCompanyId` (state + `sessionStorage`) sempre que o usuário logado não é super admin, evitando resíduo entre sessões diferentes no mesmo navegador.
3. Também limpar no `signOut` para garantir que o próximo login parta zerado.

Nenhuma mudança em `ViewAsBanner.tsx` é necessária — ele já respeita `isViewingAsCompany`.

## Verificação

- Login como Leandro → sem banner laranja, sem "somente leitura", pode editar normalmente.
- Login como Denison (super admin) → banner continua funcionando ao entrar em uma empresa via `/super-admin`.
