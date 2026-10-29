import { describe, expect, it } from "vitest";
import { GIFT_POWERS, giftTier, powerForGift } from "../../src/game/core/powers.js";

describe("powerForGift", () => {
  it("sem diamantes não há poder", () => {
    expect(powerForGift(0)).toBeNull();
  });

  it("escolhe o poder de maior nível que o valor alcança", () => {
    expect(powerForGift(1)?.kind).toBe("turbo");
    expect(powerForGift(19)?.kind).toBe("turbo");
    expect(powerForGift(20)?.kind).toBe("shield");
    expect(powerForGift(99)?.kind).toBe("shield");
    expect(powerForGift(100)?.kind).toBe("nova");
    expect(powerForGift(499)?.kind).toBe("nova");
    expect(powerForGift(500)?.kind).toBe("storm");
    expect(powerForGift(100_000)?.kind).toBe("storm");
  });

  it("a tempestade cobre a tela inteira", () => {
    expect(powerForGift(500)?.blastRadius).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("giftTier", () => {
  it("numera os poderes de 1 a 4 em ordem de valor", () => {
    expect(GIFT_POWERS.map(giftTier)).toEqual([1, 2, 3, 4]);
  });
});
