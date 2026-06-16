import { Component, ErrorInfo, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[ErrorBoundary] signOut error:", e);
    }
    try {
      // Clear any stale supabase session keys
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-") || k.includes("supabase"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    window.location.href = "/auth";
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error.message || String(this.state.error);

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
        <div className="max-w-lg w-full rounded-lg border border-border bg-card p-6 space-y-4 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Algo deu errado ao carregar a plataforma
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tente recarregar a página. Se o erro continuar, saia da conta e
              entre novamente.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition"
            >
              Recarregar página
            </button>
            <button
              onClick={this.handleSignOut}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border bg-background hover:bg-accent transition"
            >
              Sair da conta
            </button>
          </div>

          <details className="text-xs text-muted-foreground bg-muted/50 rounded p-3">
            <summary className="cursor-pointer select-none">
              Detalhes técnicos
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{message}</pre>
          </details>
        </div>
      </div>
    );
  }
}