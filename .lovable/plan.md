## Objetivo
Remover todos os `console.log()` de debug do frontend (pasta `src/`), mantendo `console.error()` e `console.warn()` legítimos. Não alterar lógica de negócio, hooks, componentes, RLS ou edge functions.

## Escopo dos arquivos afetados (6 arquivos, 17 console.log no total)

### 1. src/hooks/whatsapp/useWhatsAppSentiment.ts
- Linha 60: `console.log('[sentiment-realtime] Update detected, invalidating query');`
  - **Ação:** Remover.

### 2. src/hooks/whatsapp/useContactDetails.ts
- Linha 191: `console.log('Contact details - sentimentHistory:', sentimentHistory);`
  - **Ação:** Remover.
- Linha 192: `console.log('Contact details - conversations with metadata:', ...);`
  - **Ação:** Remover.

### 3. src/hooks/whatsapp/useConversationTopics.ts
- Linha 54: `console.log('[topics-realtime] Topics updated, invalidating query');`
  - **Ação:** Remover.

### 4. src/hooks/useProjectSetup.ts
- Linha 36: `console.log('[useProjectSetup] Calling setup-project-config edge function...');`
  - **Ação:** Remover.
- Linha 51: `console.log('[useProjectSetup] Setup completed successfully');`
  - **Ação:** Remover.

### 5. src/contexts/AuthContext.tsx
- Linha 58: `console.log('🔧 [AuthContext] Attempting to auto-create profile/role...');`
  - **Ação:** Remover.
- Linha 100: `console.log('🔍 [AuthContext] Loading user data for:', userId);`
  - **Ação:** Remover.
- Linha 112: `console.log('✅ [AuthContext] Profile loaded:', profileData);`
  - **Ação:** Remover.
- Linha 128: `console.log('✅ [AuthContext] Role loaded:', roleData.role);`
  - **Ação:** Remover.
- Linha 137: `console.log('⚠️ [AuthContext] Profile or role missing...');`
  - **Ação:** Remover.
- Linha 144: `console.log('🔄 [AuthContext] Reloading user data after auto-creation...');`
  - **Ação:** Remover.
- Linha 227: `console.log('[AuthContext] Setting up remix infrastructure...');`
  - **Ação:** Remover.
- Linha 234: `console.log('[AuthContext] Infrastructure setup complete:', data);`
  - **Ação:** Remover.
- Linha 244: `console.log('[AuthContext] Admin detected, running auto-setup...');`
  - **Ação:** Remover.

> Nota: Os `console.error` e `console.warn` neste arquivo (linhas 77, 78, 88, 110, 111, 126, 131, 153, 232, 237) permanecem inalterados, pois são tratamento de erro legítimo.

### 6. src/components/auth/ProtectedRoute.tsx
- Linha 18: `console.log('[ProtectedRoute] Redirecting unapproved user...');`
  - **Ação:** Remover.
- Linha 26: `console.log('[ProtectedRoute] Redirecting admin to setup...');`
  - **Ação:** Remover.

## Validação
Após as edições, executar `rg "console\.log" src/ -g '*.ts' -g '*.tsx' -c` para confirmar que não restam `console.log` em `src/`.
