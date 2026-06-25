Objetivo: Remover o botão laranja "Diagnosticar" (ícone Stethoscope) dos cards de instância em Configurações → WhatsApp, junto com o dialog de diagnóstico associado.

Arquivo alvo: `src/components/settings/InstanceCard.tsx`

Alterações:
1. Remover o import `Stethoscope` do `lucide-react`.
2. Remover os imports `Dialog`, `DialogContent`, `DialogDescription`, `DialogHeader`, `DialogTitle` de `@/components/ui/dialog` (só usados pelo dialog de diagnóstico).
3. Remover `diagnoseInstance` do destructuring do hook `useWhatsAppInstances`.
4. Remover os estados `diagnosis` e `showDiagnosisDialog`.
5. Remover a função `handleDiagnose`.
6. Remover o botão "Diagnosticar" do `<CardFooter>`.
7. Remover o bloco `<Dialog open={showDiagnosisDialog} ...>` inteiro do JSX final.

Nota: O hook `diagnoseInstance` e a Edge Function por trás dele continuam existindo — apenas o botão da UI é removido.