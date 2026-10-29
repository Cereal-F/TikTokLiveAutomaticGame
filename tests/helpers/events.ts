import type { CommentEvent, GiftEvent, LikeEvent } from "../../src/shared/events.js";

/** Fábricas de eventos válidos para os testes. O timestamp fica fixo para tornar os testes determinísticos. */
export function likeEvent(id: string, userId = "u1", count = 1): LikeEvent {
  return { id, kind: "like", userId, userName: `Nome ${userId}`, timestamp: 0, source: "simulation", count };
}

export function commentEvent(id: string, userId = "u1", text = "Vai!"): CommentEvent {
  return { id, kind: "comment", userId, userName: `Nome ${userId}`, timestamp: 0, source: "simulation", text };
}

export function giftEvent(id: string, userId = "u1", giftName = "Rosa", diamonds = 1): GiftEvent {
  return {
    id,
    kind: "gift",
    userId,
    userName: `Nome ${userId}`,
    timestamp: 0,
    source: "simulation",
    giftName,
    diamonds,
  };
}

/** Relógio controlável: `clock.now` é lido pelo código sob teste e `clock.advance` avança o tempo. */
export function manualClock(start = 0) {
  const clock = {
    now: start,
    read: (): number => clock.now,
    advance(ms: number): void {
      clock.now += ms;
    },
  };
  return clock;
}
