import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecordStore } from "../../src/server/records/RecordStore.js";

let dir: string;
let file: string;
const silent = (): void => {};
const fixedNow = () => new Date("2026-10-29T03:00:00.000Z");

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "ls-records-"));
  file = path.join(dir, "data", "records.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("RecordStore", () => {
  it("começa sem recorde quando o arquivo ainda não existe", () => {
    const store = new RecordStore(file, fixedNow, silent);
    expect(store.snapshot()).toEqual({ bestWave: 0, achievedAt: null, wins: 0, defeats: 0 });
  });

  it("guarda uma onda maior que o recorde e grava em arquivo", () => {
    const store = new RecordStore(file, fixedNow, silent);
    const updated = store.update(7);
    expect(updated).toEqual({ bestWave: 7, achievedAt: "2026-10-29T03:00:00.000Z", wins: 0, defeats: 0 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ ...updated, giftTotals: {} });
  });

  it("não substitui o recorde por uma onda igual ou menor", () => {
    const store = new RecordStore(file, fixedNow, silent);
    store.update(7);
    expect(store.update(7)).toBeNull();
    expect(store.update(3)).toBeNull();
    expect(store.snapshot().bestWave).toBe(7);
  });

  it("o recorde sobrevive a um novo carregamento (reinício do servidor)", () => {
    new RecordStore(file, fixedNow, silent).update(12);
    const reloaded = new RecordStore(file, fixedNow, silent);
    expect(reloaded.snapshot().bestWave).toBe(12);
  });

  it("soma vitórias e derrotas e mantém o recorde", () => {
    const store = new RecordStore(file, fixedNow, silent);
    store.update(9);
    store.recordRun("defeat");
    store.recordRun("defeat");
    const after = store.recordRun("victory");
    expect(after).toEqual({ bestWave: 9, achievedAt: "2026-10-29T03:00:00.000Z", wins: 1, defeats: 2 });
    const reloaded = new RecordStore(file, fixedNow, silent).snapshot();
    expect(reloaded.wins).toBe(1);
    expect(reloaded.defeats).toBe(2);
  });

  it("arquivo antigo, sem contadores, é lido com zero vitórias e derrotas", () => {
    writeFileSync(path.join(dir, "old.json"), JSON.stringify({ bestWave: 4, achievedAt: null }));
    const store = new RecordStore(path.join(dir, "old.json"), fixedNow, silent);
    expect(store.snapshot()).toEqual({ bestWave: 4, achievedAt: null, wins: 0, defeats: 0 });
  });

  it("ignora ondas inválidas", () => {
    const store = new RecordStore(file, fixedNow, silent);
    expect(store.update(0)).toBeNull();
    expect(store.update(-1)).toBeNull();
    expect(store.update(1.5)).toBeNull();
    expect(store.update(1_000)).toBeNull();
    expect(store.snapshot().bestWave).toBe(0);
  });

  it("arquivo corrompido não impede o início: o recorde começa do zero", () => {
    writeFileSync(path.join(dir, "bad.json"), "{não é json");
    const messages: string[] = [];
    const store = new RecordStore(path.join(dir, "bad.json"), fixedNow, (m) => messages.push(m));
    expect(store.snapshot().bestWave).toBe(0);
    expect(messages.join(" ")).toContain("inválido");
  });

  it("valores fora do formato no arquivo são descartados", () => {
    writeFileSync(path.join(dir, "shape.json"), JSON.stringify({ bestWave: "muito", achievedAt: 5 }));
    const store = new RecordStore(path.join(dir, "shape.json"), fixedNow, silent);
    expect(store.snapshot()).toEqual({ bestWave: 0, achievedAt: null, wins: 0, defeats: 0 });
  });

  it("não deixa arquivo temporário para trás após salvar", () => {
    new RecordStore(file, fixedNow, silent).update(4);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it("falha ao salvar é registrada e não lança erro", () => {
    const blocker = path.join(dir, "not-a-dir");
    writeFileSync(blocker, "x");
    const messages: string[] = [];
    const store = new RecordStore(path.join(blocker, "records.json"), fixedNow, (m) => messages.push(m));
    expect(() => store.update(3)).not.toThrow();
    expect(store.snapshot().bestWave).toBe(3);
    expect(messages.join(" ")).toContain("salvar");
  });
});
