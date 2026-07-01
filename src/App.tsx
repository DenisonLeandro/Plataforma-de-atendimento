import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute, SuperAdminRoute } from "@/components/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import PendingApproval from "./pages/PendingApproval";
import WhatsApp from "./pages/WhatsApp";
import WhatsAppSettings from "./pages/WhatsAppSettings";
import WhatsAppRelatorio from "./pages/WhatsAppRelatorio";
import WhatsAppContatos from "./pages/WhatsAppContatos";
import SuperAdminPage from "./pages/SuperAdminPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {

  return (
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
                <Route path="/pending-approval" element={<ProtectedRoute><PendingApproval /></ProtectedRoute>} />
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/whatsapp" element={<ProtectedRoute><WhatsApp /></ProtectedRoute>} />
                <Route path="/whatsapp/settings" element={<ProtectedRoute><WhatsAppSettings /></ProtectedRoute>} />
                <Route path="/whatsapp/relatorio" element={<ProtectedRoute><WhatsAppRelatorio /></ProtectedRoute>} />
                <Route path="/whatsapp/contatos" element={<ProtectedRoute><WhatsAppContatos /></ProtectedRoute>} />
                <Route path="/super-admin" element={<ProtectedRoute><SuperAdminRoute><SuperAdminPage /></SuperAdminRoute></ProtectedRoute>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </TooltipProvider>
            </NotificationProvider>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
