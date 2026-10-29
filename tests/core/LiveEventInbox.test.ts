import { describe, expect, it } from "vitest";
import { LiveEventInbox } from "../../src/game/core/LiveEventInbox.js";
import { likeEvent } from "../helpers/events.js";

describe("LiveEventInbox", () => {
  it("entrega os eventos na ordem de chegada e esvazia a fila", () => {
    const inbox = new LiveEventInbox(10);
    inbox.push(likeEvent("a"));
    inbox.push(likeEvent("b"));
    expect(inbox.pending).toBe(2);
    expect(inbox.drain().map((e) => e.id)).toEqual(["a", "b"]);
    expect(inbox.pending).toBe(0);
    expect(inbox.drain()).toEqual([]);
  });

  it("descarta os eventos mais antigos quando passa da capacidade", () => {
    const inbox = new LiveEventInbox(2);
    inbox.push(likeEvent("a"));
    inbox.push(likeEvent("b"));
    inbox.push(likeEvent("c"));
    expect(inbox.dropped).toBe(1);
    expect(inbox.drain().map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("rejeita capacidade não positiva", () => {
    expect(() => new LiveEventInbox(0)).toThrow(RangeError);
  });
});
