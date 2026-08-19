import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute, SuperAdminRoute } from "@/components/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import PendingApproval from "./pages/PendingApproval";
import ResetPassword from "./pages/ResetPassword";
import WhatsApp from "./pages/WhatsApp";
import WhatsAppSettings from "./pages/WhatsAppSettings";
import WhatsAppRelatorio from "./pages/WhatsAppRelatorio";
import WhatsAppContatos from "./pages/WhatsAppContatos";
import SuperAdminPage from "./pages/SuperAdminPage";
import SuperAdminAiPage from "./pages/SuperAdminAiPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {

  return (
    // Tema claro/escuro/automático. `attribute="class"` aplica a classe .dark
    // no <html>, que é exatamente o modo que o Tailwind deste projeto já espera
    // (darkMode: ["class"]) e que a paleta escura do index.css já atende.
    // Padrão claro de propósito: ninguém tem a interface trocada sem pedir.
    // `disableTransitionOnChange` evita que as transições globais de 160ms
    // façam a tela inteira piscar durante a troca.
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ErrorBoundary>
            <AuthProvider>
              <NotificationProvider>
                <TooltipProvider>
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  {/* Publica: quem chega pelo link do e-mail ainda nao tem senha valida. */}
                  <Route path="/redefinir-senha" element={<ResetPassword />} />
                  <Route path="/pending-approval" element={<ProtectedRoute><PendingApproval /></ProtectedRoute>} />
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                  <Route path="/whatsapp" element={<ProtectedRoute><WhatsApp /></ProtectedRoute>} />
                  <Route path="/whatsapp/settings" element={<ProtectedRoute><WhatsAppSettings /></ProtectedRoute>} />
                  <Route path="/whatsapp/relatorio" element={<ProtectedRoute><WhatsAppRelatorio /></ProtectedRoute>} />
                  <Route path="/whatsapp/contatos" element={<ProtectedRoute><WhatsAppContatos /></ProtectedRoute>} />
                  <Route path="/super-admin" element={<ProtectedRoute><SuperAdminRoute><SuperAdminPage /></SuperAdminRoute></ProtectedRoute>} />
                  <Route path="/super-admin/ia" element={<ProtectedRoute><SuperAdminRoute><SuperAdminAiPage /></SuperAdminRoute></ProtectedRoute>} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </TooltipProvider>
              </NotificationProvider>
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
