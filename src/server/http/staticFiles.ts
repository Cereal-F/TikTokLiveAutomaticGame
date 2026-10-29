import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const ROUTE_ALIASES: Record<string, string> = {
  "/": "/index.html",
  "/admin": "/admin.html",
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

/**
 * Converte a URL pedida em um caminho dentro de `root`.
 * Retorna null se o caminho sair da raiz ou for inválido (proteção contra path traversal).
 */
export function resolveSafePath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const route = ROUTE_ALIASES[decoded] ?? decoded;
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, `.${route}`);

  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) return null;
  return candidate;
}

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** Serve arquivos estáticos do build do cliente. Apenas GET e HEAD. */
export function createStaticHandler(root: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const filePath = resolveSafePath(root, pathname);
    if (!filePath) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Requisição inválida");
      return;
    }

    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("não é arquivo");
      res.writeHead(200, {
        "Content-Type": contentTypeFor(filePath),
        "Content-Length": info.size,
        "Cache-Control": "no-cache",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end(
        "Arquivo não encontrado. Execute 'npm run build' antes de iniciar o servidor.",
      );
    }
  };
}
