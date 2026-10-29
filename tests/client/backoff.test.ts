import { describe, expect, it } from "vitest";
import { nextBackoffMs } from "../../src/shared/backoff.js";

describe("nextBackoffMs", () => {
  it("cresce exponencialmente a partir do mínimo", () => {
    expect(nextBackoffMs(0, 500, 5_000)).toBe(500);
    expect(nextBackoffMs(1, 500, 5_000)).toBe(1_000);
    expect(nextBackoffMs(3, 500, 5_000)).toBe(4_000);
  });

  it("nunca ultrapassa o máximo", () => {
    expect(nextBackoffMs(4, 500, 5_000)).toBe(5_000);
    expect(nextBackoffMs(1_000, 500, 5_000)).toBe(5_000);
  });

  it("trata tentativas negativas como a primeira", () => {
    expect(nextBackoffMs(-3, 500, 5_000)).toBe(500);
  });
});
