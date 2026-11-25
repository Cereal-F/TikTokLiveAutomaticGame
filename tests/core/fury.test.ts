import { describe, expect, it } from "vitest";
import { FURY_MS, GIFT_POWERS, LION_FURY_MS, effectText, powerForGift } from "../../src/game/core/powers.js";

describe("duração da fúria", () => {
  it("o Leão (100) dá 45 s de fúria e o Foguete (500) dá 90 s", () => {
    expect(powerForGift(100)?.kind).toBe("nova");
    expect(powerForGift(100)?.berserkMs).toBe(LION_FURY_MS);
    expect(LION_FURY_MS).toBe(45_000);
    expect(powerForGift(500)?.kind).toBe("storm");
    expect(powerForGift(500)?.berserkMs).toBe(FURY_MS);
    expect(FURY_MS).toBe(90_000);
  });

  it("o texto do aviso mostra a duração certa para cada presente", () => {
    const lion = GIFT_POWERS.find((power) => power.kind === "nova")!;
    const rocket = GIFT_POWERS.find((power) => power.kind === "storm")!;
    expect(effectText(lion, 1)).toContain("+45 s de FÚRIA");
    expect(effectText(rocket, 1)).toContain("+90 s de FÚRIA");
  });
});
