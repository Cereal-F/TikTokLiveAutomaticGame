/** Hosts aceitos para o WebSocket do TikFinity: somente a própria máquina. */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Confere se a URL é um WebSocket (ws://) apontando para a própria máquina.
 * O TikFinity roda localmente; qualquer outro destino é recusado para que o
 * servidor nunca envie nem leia dados de rede externa por esta via.
 */
export function isLocalWebSocketUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "ws:" && LOCAL_HOSTS.has(url.hostname);
}
