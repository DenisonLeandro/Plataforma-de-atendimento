// Wrapper de fetch com timeout via AbortController.
// Evita que uma edge function fique pendurada quando o serviço externo
// (Evolution API / Lovable AI Gateway) trava — em vez de esperar ~60s até o
// Deno matar, abortamos no tempo definido e lançamos um erro claro.
//
// Mantém o mesmo contrato do fetch nativo: mesma URL, mesmos headers, body e
// método. Só adiciona o `signal` do AbortController. Se a request já traz um
// `signal` próprio, NÃO sobrescreve (respeita o controlador existente).
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 15000, signal: existingSignal, ...fetchOptions } = options;

  // Se o chamador já passou um signal, não criamos outro controlador.
  if (existingSignal) {
    return await fetch(url, { ...fetchOptions, signal: existingSignal });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout: ${url} não respondeu em ${timeout / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
