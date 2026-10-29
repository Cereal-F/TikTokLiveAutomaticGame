import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentTypeFor, resolveSafePath } from "../../src/server/http/staticFiles.js";

const root = path.resolve("/srv/game/dist");

describe("resolveSafePath", () => {
  it("resolve a raiz e as rotas conhecidas", () => {
    expect(resolveSafePath(root, "/")).toBe(path.join(root, "index.html"));
    expect(resolveSafePath(root, "/admin")).toBe(path.join(root, "admin.html"));
  });

  it("resolve arquivos dentro da raiz", () => {
    expect(resolveSafePath(root, "/assets/app.js")).toBe(path.join(root, "assets", "app.js"));
  });

  it("bloqueia tentativas de sair da raiz", () => {
    expect(resolveSafePath(root, "/../secret.txt")).toBeNull();
    expect(resolveSafePath(root, "/%2e%2e/secret.txt")).toBeNull();
    expect(resolveSafePath(root, "/assets/../../secret.txt")).toBeNull();
  });

  it("bloqueia pastas irmãs com o mesmo prefixo (ex.: dist-evil)", () => {
    expect(resolveSafePath(root, "/../dist-evil/x.js")).toBeNull();
  });

  it("rejeita sequências inválidas e bytes nulos", () => {
    expect(resolveSafePath(root, "/%E0%A4%A")).toBeNull();
    expect(resolveSafePath(root, "/a%00b")).toBeNull();
  });
});

describe("contentTypeFor", () => {
  it("usa o tipo correto para arquivos conhecidos e genérico para os demais", () => {
    expect(contentTypeFor("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("app.JS")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeFor("arquivo.bin")).toBe("application/octet-stream");
  });
});
