import type { LeaderboardEntry } from "../../shared/protocol.js";

interface Totals {
  userName: string;
  diamonds: number;
}

/**
 * Soma os diamantes enviados por cada espectador durante a live.
 * Empates são resolvidos pela ordem em que cada um apareceu pela primeira vez.
 */
export class GiftLeaderboard {
  private readonly totals = new Map<string, Totals>();

  add(userId: string, userName: string, diamonds: number): void {
    if (!Number.isInteger(diamonds) || diamonds <= 0) return;
    const current = this.totals.get(userId);
    if (current) {
      current.diamonds += diamonds;
      current.userName = userName;
    } else {
      this.totals.set(userId, { userName, diamonds });
    }
  }

  top(count = 3): LeaderboardEntry[] {
    return [...this.totals.values()]
      .sort((a, b) => b.diamonds - a.diamonds)
      .slice(0, count)
      .map(({ userName, diamonds }) => ({ userName, diamonds }));
  }

  reset(): void {
    this.totals.clear();
  }
}
