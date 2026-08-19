# Redefinir senha da conta rhl0508@gmail.com (Renata Henrique Leandro)

Senhas nunca podem ser descobertas: o backend guarda apenas um hash irreversível. A única saída é definir uma nova senha.

## Opção recomendada — a própria usuária redefine
1. Na tela de login, usar "Esqueci minha senha" com o e-mail rhl0508@gmail.com.
2. O e-mail de recuperação leva à página `/reset-password`, onde ela define a nova senha.
3. Confirmar que essa opção existe e funciona na tela de autenticação; se o link "Esqueci minha senha" ou a rota `/reset-password` não estiverem presentes, implementá-los.

## Opção alternativa — redefinição administrativa
Se ela não tiver acesso ao e-mail, defino manualmente uma senha temporária para a conta usando a API administrativa de autenticação, valido o login e repasso a senha aqui no chat para ela trocar depois no perfil.

Para isso preciso que você informe qual senha temporária usar (ou eu gero uma forte e segura).

## Detalhes técnicos
- Fluxo de recuperação: `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })` e `supabase.auth.updateUser({ password })` na página de reset.
- Redefinição administrativa: chamada única com a service role no endpoint admin de usuários; nada de credencial é gravado no repositório.
