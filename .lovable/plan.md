## Diagnóstico

O erro **"Password is known to be weak and easy to guess"** vem do **HIBP (Have I Been Pwned) Check** ativo no Lovable Cloud Auth. A senha digitada (8 caracteres) consta na base de senhas vazadas do HIBP e é rejeitada pelo servidor de auth — não é bug da plataforma, é uma proteção de segurança funcionando.

Hoje o `SignupForm.tsx` só valida:
- mínimo 6 caracteres
- confirmação igual

Não avisa o usuário sobre força de senha nem sobre a checagem HIBP, então quando o backend rejeita, a mensagem aparece em inglês e confunde.

## Plano de correção

**1. Melhorar validação client-side em `src/components/auth/SignupForm.tsx`:**
- Aumentar mínimo para **8 caracteres**
- Exigir pelo menos: 1 letra maiúscula, 1 minúscula, 1 número
- Mostrar indicador visual de força da senha em tempo real
- Texto de ajuda abaixo do campo: "Use 8+ caracteres com letras, números e símbolos. Evite senhas comuns."

**2. Traduzir/tratar o erro HIBP:**
- Interceptar `error.message` contendo `"weak"` ou `"pwned"` e exibir toast amigável em português:  
  *"Esta senha é muito comum e foi encontrada em vazamentos de dados. Escolha uma senha mais forte e única."*

**3. Manter o HIBP Check ativado** (é boa prática de segurança — não recomendo desabilitar).

## Ação imediata para a Estela

Ela precisa escolher uma senha mais forte e única (não usar variações de "12345678", "senha123", nome+ano, etc.). Sugerir algo como uma frase com símbolos: `DomPiscinas@2026!`.

## Arquivos afetados

- `src/components/auth/SignupForm.tsx` — validação + mensagem traduzida + medidor de força
