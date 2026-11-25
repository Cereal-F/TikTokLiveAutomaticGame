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

  it("pódio por diamantes, com a foto de quem presenteou", () => {
    const board = new GiftLeaderboard();
    board.add("ana", "Ana", 30, "https://img/ana.png");
    board.add("bia", "Bia", 90);
    board.addLikes("caio", "Caio", 500);
    expect(board.podium()).toEqual({
      basis: "diamonds",
      entries: [
        { userId: "bia", userName: "Bia", score: 90 },
        { userId: "ana", userName: "Ana", avatarUrl: "https://img/ana.png", score: 30 },
      ],
    });
  });

  it("sem nenhum presente, o pódio usa as curtidas", () => {
    const board = new GiftLeaderboard();
    board.addLikes("ana", "Ana", 4);
    board.addLikes("bia", "Bia", 9);
    board.addLikes("bia", "Bia", 1);
    expect(board.podium()).toEqual({
      basis: "likes",
      entries: [
        { userId: "bia", userName: "Bia", score: 10 },
        { userId: "ana", userName: "Ana", score: 4 },
      ],
    });
  });

  it("o pódio mostra no máximo três espectadores", () => {
    const board = new GiftLeaderboard();
    for (let i = 1; i <= 5; i += 1) board.add(`u${i}`, `U${i}`, i);
    expect(board.podium().entries.map((entry) => entry.userName)).toEqual(["U5", "U4", "U3"]);
  });

  it("a versão muda a cada alteração e não muda ao ler", () => {
    const board = new GiftLeaderboard();
    const start = board.version;
    board.addLikes("ana", "Ana", 1);
    expect(board.version).toBeGreaterThan(start);
    const afterLike = board.version;
    board.podium();
    board.top();
    expect(board.version).toBe(afterLike);
    board.reset();
    expect(board.version).toBeGreaterThan(afterLike);
  });

  it("zerar a rodada também zera o pódio", () => {
    const board = new GiftLeaderboard();
    board.addLikes("ana", "Ana", 3);
    board.reset();
    expect(board.podium()).toEqual({ basis: "likes", entries: [] });
  });
});
