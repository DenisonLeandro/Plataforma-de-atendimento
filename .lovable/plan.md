# Plano — Corrigir isolamento entre empresas (4 findings)

Uma única migration reescreve as 4 policies. Nenhuma mudança de código no frontend/edge (todos os acessos hoje já assumem escopo por empresa; hoje as policies é que estão largas demais).

## 1. `whatsapp_instance_secrets` — erro crítico

Recriar a policy `Only admins can manage secrets` para exigir que a instância pertença à empresa do admin, com exceção para super admins autorizados via `super_admin_can_write_company`:

```
USING / WITH CHECK:
  EXISTS (
    SELECT 1 FROM whatsapp_instances i
    WHERE i.id = whatsapp_instance_secrets.instance_id
      AND (
        i.company_id = get_user_company_id(auth.uid())
        OR super_admin_can_write_company(auth.uid(), i.company_id)
      )
  )
  AND has_role(auth.uid(), 'admin')
```

## 2. `whatsapp_webhook_events` — erro crítico

Recriar a policy `Admins and supervisors can view webhook events` (SELECT) exigindo que o `instance_id` do evento seja visível ao usuário:

```
USING:
  (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'))
  AND can_user_see_instance(auth.uid(), instance_id)
```

## 3. Storage `whatsapp-media` — erro crítico

Substituir a policy de SELECT. Arquivos são armazenados como `<instance_name>/...` (uploads do webhook) ou `<user_id>/...` (uploads de agente). Ler apenas se a primeira pasta identifica uma instância/usuário da mesma empresa do leitor:

```
USING:
  bucket_id = 'whatsapp-media'
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active AND p.is_approved)
  AND (
    EXISTS (
      SELECT 1 FROM whatsapp_instances i
      WHERE i.instance_name = (storage.foldername(name))[1]
        AND (
          i.company_id = get_user_company_id(auth.uid())
          OR super_admin_can_write_company(auth.uid(), i.company_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id::text = (storage.foldername(name))[1]
        AND p2.company_id = get_user_company_id(auth.uid())
    )
  )
```

Impacto: mídias antigas cujo primeiro segmento não bate com nenhuma instância/usuário conhecido deixam de ser acessíveis via URL assinada. Isso é o comportamento correto — hoje qualquer atendente aprovado consegue baixá-las.

## 4. Storage `avatars` — aviso

Substituir a policy de SELECT para exigir que o dono do avatar (primeira pasta = `user_id`) pertença à mesma empresa do leitor:

```
USING:
  bucket_id = 'avatars'
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active AND p.is_approved)
  AND EXISTS (
    SELECT 1 FROM profiles owner
    WHERE owner.id::text = (storage.foldername(name))[1]
      AND owner.company_id = get_user_company_id(auth.uid())
  )
```

## Detalhes técnicos

- Tudo em uma única migration (DROP + CREATE POLICY para cada uma das 4).
- Super admins mantêm acesso cross-company apenas onde já existe autorização explícita (`super_admin_can_write_company`); nas policies de storage o super admin não precisa desse cross-access — se precisar visualizar mídia de outra empresa, usa o fluxo "Entrar como…" já existente, que muda o `company_id` efetivo do contexto.
- Ao final, `manage_security_finding` marca os 4 `internal_id` como fixed.
- Sem mudanças em edge functions: `send-whatsapp-message` já usa Service Role para mídia (bypassa RLS), e o webhook grava mídia como service_role.
