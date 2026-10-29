import type { LiveEvent } from "../../shared/events.js";
import { LIVE_EFFECTS, PLAYER, WAVES } from "./constants.js";
import { killPoints, waveConfig, type WaveConfig } from "./waves.js";

export type SessionPhase = "playing" | "intermission" | "defeated";

export interface SessionStats {
  wave: number;
  score: number;
  kills: number;
  survivedMs: number;
}

/** Acontecimentos que a cena precisa tratar (criar inimigos, mostrar banners, encerrar a partida). */
export type SessionEvent =
  | { type: "spawn" }
  | { type: "waveStarted"; wave: number }
  | { type: "waveCleared"; wave: number }
  | { type: "playerHit"; damage: number; hp: number }
  | { type: "defeated"; stats: SessionStats };

/** Texto curto mostrado na tela em resposta a um evento da live. */
export interface LiveFeedback {
  text: string;
  tone: "score" | "heal" | "boost" | "chat";
}

/**
 * Estado completo de uma partida, sem dependência de renderização.
 * A cena chama `update` a cada quadro e reage aos `SessionEvent` retornados.
 */
export class GameSession {
  private currentPhase: SessionPhase = "playing";
  private currentHp: number = PLAYER.maxHp;
  private currentWave = 1;
  private currentScore = 0;
  private currentKills = 0;
  private elapsedMs = 0;
  private spawnedInWave = 0;
  private killedInWave = 0;
  private spawnTimerMs = 0;
  private invulnerableMs = 0;
  private intermissionMs = 0;
  private boostMs = 0;
  private likeProgress = 0;

  get phase(): SessionPhase {
    return this.currentPhase;
  }

  get hp(): number {
    return this.currentHp;
  }

  get maxHp(): number {
    return PLAYER.maxHp;
  }

  get wave(): number {
    return this.currentWave;
  }

  get score(): number {
    return this.currentScore;
  }

  get kills(): number {
    return this.currentKills;
  }

  get survivedMs(): number {
    return this.elapsedMs;
  }

  get enemiesAlive(): number {
    return this.spawnedInWave - this.killedInWave;
  }

  get waveSettings(): WaveConfig {
    return waveConfig(this.currentWave);
  }

  get boostActive(): boolean {
    return this.boostMs > 0;
  }

  get attackCooldownMs(): number {
    return this.boostActive
      ? PLAYER.attackCooldownMs / LIVE_EFFECTS.boostAttackSpeedMultiplier
      : PLAYER.attackCooldownMs;
  }

  get projectileDamage(): number {
    return this.boostActive ? PLAYER.boostedProjectileDamage : PLAYER.projectileDamage;
  }

  get isInvulnerable(): boolean {
    return this.invulnerableMs > 0;
  }

  start(): SessionEvent[] {
    return this.beginWave();
  }

  /** Avança o tempo da partida. Retorna os acontecimentos ocorridos neste intervalo. */
  update(dtMs: number): SessionEvent[] {
    if (this.currentPhase === "defeated" || dtMs <= 0) return [];

    const events: SessionEvent[] = [];
    this.elapsedMs += dtMs;
    this.invulnerableMs = Math.max(0, this.invulnerableMs - dtMs);
    this.boostMs = Math.max(0, this.boostMs - dtMs);

    if (this.currentPhase === "intermission") {
      this.intermissionMs -= dtMs;
      if (this.intermissionMs <= 0) {
        this.currentWave += 1;
        events.push(...this.beginWave());
      }
      return events;
    }

    const config = waveConfig(this.currentWave);
    if (this.spawnedInWave < config.enemyCount) {
      this.spawnTimerMs -= dtMs;
      while (this.spawnTimerMs <= 0 && this.spawnedInWave < config.enemyCount) {
        this.spawnedInWave += 1;
        this.spawnTimerMs += config.spawnIntervalMs;
        events.push({ type: "spawn" });
      }
    }
    return events;
  }

  registerKill(): SessionEvent[] {
    if (this.currentPhase !== "playing") return [];

    this.killedInWave += 1;
    this.currentKills += 1;
    this.currentScore += killPoints(this.currentWave);

    if (this.killedInWave >= waveConfig(this.currentWave).enemyCount) {
      this.currentPhase = "intermission";
      this.intermissionMs = WAVES.intermissionMs;
      return [{ type: "waveCleared", wave: this.currentWave }];
    }
    return [];
  }

  /** Aplica dano de contato. Há um período de invulnerabilidade após cada golpe. */
  damagePlayer(amount: number): SessionEvent[] {
    if (this.currentPhase === "defeated" || this.invulnerableMs > 0 || amount <= 0) return [];

    this.currentHp = Math.max(0, this.currentHp - amount);
    this.invulnerableMs = PLAYER.invulnerabilityMs;

    const events: SessionEvent[] = [{ type: "playerHit", damage: amount, hp: this.currentHp }];
    if (this.currentHp === 0) {
      this.currentPhase = "defeated";
      events.push({ type: "defeated", stats: this.stats() });
    }
    return events;
  }

  heal(amount: number): void {
    if (this.currentPhase === "defeated" || amount <= 0) return;
    this.currentHp = Math.min(PLAYER.maxHp, this.currentHp + amount);
  }

  activateBoost(durationMs: number): void {
    this.boostMs = Math.max(this.boostMs, durationMs);
  }

  /** Converte um evento da live em efeitos de jogo e retorna os textos para a tela. */
  applyLiveEvent(event: LiveEvent): LiveFeedback[] {
    switch (event.kind) {
      case "like": {
        this.likeProgress += event.count;
        this.currentScore += event.count;
        const feedback: LiveFeedback[] = [{ text: `+${event.count} curtidas`, tone: "score" }];
        while (this.likeProgress >= LIVE_EFFECTS.likesPerHeal) {
          this.likeProgress -= LIVE_EFFECTS.likesPerHeal;
          this.heal(LIVE_EFFECTS.likeHealAmount);
          feedback.push({ text: `Cura +${LIVE_EFFECTS.likeHealAmount}`, tone: "heal" });
        }
        return feedback;
      }
      case "comment": {
        this.currentScore += LIVE_EFFECTS.commentScore;
        return [{ text: `${event.userName}: ${event.text}`, tone: "chat" }];
      }
      case "gift": {
        this.currentScore += event.diamonds;
        this.activateBoost(LIVE_EFFECTS.giftBoostMs);
        return [{ text: `${event.userName} enviou ${event.giftName}! Ataque turbo`, tone: "boost" }];
      }
    }
  }

  stats(): SessionStats {
    return {
      wave: this.currentWave,
      score: this.currentScore,
      kills: this.currentKills,
      survivedMs: this.elapsedMs,
    };
  }

  private beginWave(): SessionEvent[] {
    this.currentPhase = "playing";
    this.spawnedInWave = 0;
    this.killedInWave = 0;
    this.spawnTimerMs = 0;
    return [{ type: "waveStarted", wave: this.currentWave }];
  }
}
