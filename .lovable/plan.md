## Objetivo
Definir a senha da conta **Maria Eduarda** (`mariaeduardasilva.me2003@gmail.com`, empresa Acquadu) como a senha informada e confirmar que o login funciona.

## Situação verificada
- A conta existe, e-mail confirmado, perfil ativo e aprovado, vinculado à empresa Acquadu.
- Último acesso: 29/07 (o vínculo de empresa já foi corrigido anteriormente).
- Portanto o problema é apenas de credencial de acesso.

## Passos
1. Redefinir a senha da conta diretamente no backend de autenticação (operação administrativa pontual, executada por ferramenta — nada é escrito no código do projeto).
2. Testar o login de verdade: abrir a tela de login da aplicação em navegador automatizado, entrar com o e-mail e a nova senha, e confirmar que a sessão é criada e a plataforma carrega as conversas da instância Acquadu.
3. Reportar o resultado do teste (sucesso ou erro exato).

## Regra de segurança respeitada
- A senha **não** será escrita em nenhum arquivo do projeto, nem em migração, nem em comentário, nem em variável de ambiente versionada — ou seja, nada disso vai para o GitHub.
- O teste usará a senha apenas em memória, dentro do script temporário fora do repositório, que é descartado.
- Recomendação: peça para ela trocar a senha no próprio perfil depois do primeiro acesso.

## Detalhes técnicos
- Atualização feita na conta de autenticação (`auth`) pelo canal administrativo, não por SQL direto na tabela de senhas.
- Verificação de login feita contra o app rodando localmente com o cliente de autenticação real, garantindo que o fluxo completo (sessão + perfil + acesso à instância) funciona.
