import { describe, expect, it } from "vitest";
import { GiftLeaderboard } from "../../src/server/pipeline/GiftLeaderboard.js";

describe("GiftLeaderboard", () => {
  it("soma os diamantes de cada espectador", () => {
    const board = new GiftLeaderboard();
    board.add("u1", "Ana", 5);
    board.add("u1", "Ana", 20);
    board.add("u2", "Bruno", 10);
    expect(board.top()).toEqual([
      { userName: "Ana", diamonds: 25 },
      { userName: "Bruno", diamonds: 10 },
    ]);
  });

  it("mostra apenas os três primeiros, do maior para o menor", () => {
    const board = new GiftLeaderboard();
    board.add("a", "A", 1);
    board.add("b", "B", 50);
    board.add("c", "C", 30);
    board.add("d", "D", 10);
    board.add("e", "E", 70);
    expect(board.top(3).map((entry) => entry.userName)).toEqual(["E", "B", "C"]);
  });

  it("usa o nome mais recente do espectador", () => {
    const board = new GiftLeaderboard();
    board.add("u1", "Antigo", 5);
    board.add("u1", "Novo", 5);
    expect(board.top()[0]?.userName).toBe("Novo");
  });

  it("em caso de empate, quem apareceu primeiro fica na frente", () => {
    const board = new GiftLeaderboard();
    board.add("u1", "Primeiro", 10);
    board.add("u2", "Segundo", 10);
    expect(board.top().map((entry) => entry.userName)).toEqual(["Primeiro", "Segundo"]);
  });

  it("ignora valores zero, negativos ou fracionários", () => {
    const board = new GiftLeaderboard();
    board.add("u1", "Ana", 0);
    board.add("u1", "Ana", -5);
    board.add("u1", "Ana", 1.5);
    expect(board.top()).toEqual([]);
  });

  it("zerar o ranking limpa todos os espectadores", () => {
    const board = new GiftLeaderboard();
    board.add("u1", "Ana", 5);
    board.reset();
    expect(board.top()).toEqual([]);
  });
});
