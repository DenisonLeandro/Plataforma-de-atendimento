import { createRoot } from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");

const missingEnvironmentVariables = [
  ["VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL],
  ["VITE_SUPABASE_PUBLISHABLE_KEY", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY],
].filter(([, value]) => !value);

function renderEnvironmentError() {
  if (!rootElement) return;

  createRoot(rootElement).render(
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <section className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-destructive">Configuração indisponível</p>
        <h1 className="text-2xl font-semibold">Não foi possível iniciar a plataforma</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          O build atual não recebeu as variáveis públicas necessárias para conectar ao backend. Publique novamente a aplicação após a sincronização da configuração do projeto.
        </p>
      </section>
    </main>
  );
}

async function bootstrap() {
  if (!rootElement) return;

  if (missingEnvironmentVariables.length > 0) {
    console.error(
      "Missing required public environment variables:",
      missingEnvironmentVariables.map(([name]) => name)
    );
    renderEnvironmentError();
    return;
  }

  const { default: App } = await import("./App.tsx");
  createRoot(rootElement).render(<App />);
}

bootstrap().catch((error) => {
  console.error("Failed to start application", error);
  renderEnvironmentError();
});
