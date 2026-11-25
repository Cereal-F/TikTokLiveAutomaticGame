import type { LeaderboardEntry, Podium, PodiumEntry } from "../../shared/protocol.js";

interface Supporter {
  userId: string;
  userName: string;
  avatarUrl?: string;
  diamonds: number;
  likes: number;
}

/**
 * Quem mais apoiou a rodada atual: diamantes de cada presente e curtidas de cada espectador.
 * Empates são resolvidos pela ordem em que cada um apareceu pela primeira vez.
 * Cada partida começa do zero.
 */
export class GiftLeaderboard {
  private readonly supporters = new Map<string, Supporter>();
  private changes = 0;

  /** Número que muda a cada alteração: quem envia a lista só precisa reenviar quando ele muda. */
  get version(): number {
    return this.changes;
  }

  add(userId: string, userName: string, diamonds: number, avatarUrl?: string): void {
    if (!Number.isInteger(diamonds) || diamonds <= 0) return;
    this.supporterFor(userId, userName, avatarUrl).diamonds += diamonds;
    this.changes += 1;
  }

  addLikes(userId: string, userName: string, count: number, avatarUrl?: string): void {
    if (!Number.isInteger(count) || count <= 0) return;
    this.supporterFor(userId, userName, avatarUrl).likes += count;
    this.changes += 1;
  }

  /** Top de presenteadores da rodada, só por diamantes. */
  top(count = 3): LeaderboardEntry[] {
    return [...this.supporters.values()]
      .filter((supporter) => supporter.diamonds > 0)
      .sort((a, b) => b.diamonds - a.diamonds)
      .slice(0, count)
      .map(({ userName, diamonds }) => ({ userName, diamonds }));
  }

  /** Pódio da rodada: por diamantes se alguém presenteou; senão, por curtidas. */
  podium(count = 3): Podium {
    const all = [...this.supporters.values()];
    const byDiamonds = all.some((supporter) => supporter.diamonds > 0);
    const scoreOf = (supporter: Supporter): number => (byDiamonds ? supporter.diamonds : supporter.likes);
    const entries: PodiumEntry[] = all
      .filter((supporter) => scoreOf(supporter) > 0)
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, count)
      .map((supporter) => ({
        userId: supporter.userId,
        userName: supporter.userName,
        ...(supporter.avatarUrl ? { avatarUrl: supporter.avatarUrl } : {}),
        score: scoreOf(supporter),
      }));
    return { basis: byDiamonds ? "diamonds" : "likes", entries };
  }

  reset(): void {
    this.supporters.clear();
    this.changes += 1;
  }

  private supporterFor(userId: string, userName: string, avatarUrl?: string): Supporter {
    let supporter = this.supporters.get(userId);
    if (!supporter) {
      supporter = { userId, userName, diamonds: 0, likes: 0 };
      this.supporters.set(userId, supporter);
    }
    // O nome e a foto mais recentes são os que aparecem.
    supporter.userName = userName;
    if (avatarUrl) supporter.avatarUrl = avatarUrl;
    return supporter;
  }
}
