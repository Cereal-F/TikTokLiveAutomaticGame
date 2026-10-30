import { describe, expect, it } from "vitest";
import { SPOTLIGHT, SpotlightQueue, type Spotlight } from "../../src/game/core/spotlight.js";

function like(userId: string, count: number): Spotlight {
  return { kind: "like", userId, userName: userId, title: `+${count}`, effect: "", tier: 0, count };
}

function gift(userId: string): Spotlight {
  return { kind: "gift", userId, userName: userId, title: "Rosa", effect: "+8 s de TURBO", tier: 1, count: 1 };
}

describe("SpotlightQueue", () => {
  it("mostra um aviso por vez, na ordem de chegada, e passa ao próximo quando o atual acaba", () => {
    const queue = new SpotlightQueue();
    const first = gift("ana");
    const second = gift("bia");
    queue.push(first);
    queue.push(second);
    expect(queue.tick(0)).toBe(first);
    expect(queue.tick(SPOTLIGHT.giftMs - 1)).toBe(first);
    expect(queue.tick(SPOTLIGHT.giftMs)).toBe(second);
    expect(queue.tick(SPOTLIGHT.giftMs * 2)).toBeNull();
  });

  it("junta curtidas seguidas num só aviso, somando a quantidade", () => {
    const queue = new SpotlightQueue();
    queue.push(like("ana", 2));
    queue.push(like("bia", 3));
    expect(queue.pendingCount).toBe(1);
    const shown = queue.tick(0);
    expect(shown?.count).toBe(5);
    expect(shown?.userId).toBe("bia");
  });

  it("descarta o aviso mais antigo quando a fila enche", () => {
    const queue = new SpotlightQueue();
    for (let i = 0; i < SPOTLIGHT.maxQueued + 2; i += 1) queue.push(gift(`u${i}`));
    expect(queue.pendingCount).toBe(SPOTLIGHT.maxQueued);
    expect(queue.tick(0)?.userId).toBe("u2");
  });
});
