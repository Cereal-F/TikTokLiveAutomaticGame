import type { LiveEvent } from "../../shared/events.js";
import { BOSS, LIVE_EFFECTS, PLAYER, WAVES } from "./constants.js";
import { powerForGift, type GiftPower } from "./powers.js";
import { killPoints, waveConfig, type WaveConfig } from "./waves.js";

export type SessionPhase = "playing" | "intermission" | "defeated" | "victory";

export interface SessionStats {
  wave: number;
  score: number;
  kills: number;
  survivedMs: number;
}

/** Acontecimentos que a cena precisa tratar (criar inimigos, mostrar banners, aplicar áreas, encerrar a partida). */
export type SessionEvent =
  /** `boss` é verdadeiro só para o chefe da onda, que é o primeiro inimigo criado nela. */
  | { type: "spawn"; boss: boolean }
  | { type: "waveStarted"; wave: number }
  | { type: "waveCleared"; wave: number }
  | { type: "playerHit"; damage: number; hp: number }
  | { type: "power"; power: GiftPower }
  | { type: "defeated"; stats: SessionStats }
  | { type: "victory"; stats: SessionStats };

/** Texto curto mostrado na tela em resposta a um evento da live. */
export interface LiveFeedback {
  text: string;
  tone: "score" | "heal" | "boost" | "chat" | "power";
}

/** Resultado de aplicar um evento da live: textos para a tela e acontecimentos para a cena. */
export interface LiveOutcome {
  feedback: LiveFeedback[];
  events: SessionEvent[];
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
  private turboMs = 0;
  private shieldMs = 0;
  private likeProgress = 0;

  get phase(): SessionPhase {
    return this.currentPhase;
  }

  /** Verdadeiro depois da derrota ou da vitória: a partida não aceita mais efeitos. */
  get isOver(): boolean {
    return this.currentPhase === "defeated" || this.currentPhase === "victory";
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

  get turboActive(): boolean {
    return this.turboMs > 0;
  }

  get turboRemainingMs(): number {
    return this.turboMs;
  }

  get shieldActive(): boolean {
    return this.shieldMs > 0;
  }

  get shieldRemainingMs(): number {
    return this.shieldMs;
  }

  get attackCooldownMs(): number {
    return this.turboActive ? PLAYER.attackCooldownMs / LIVE_EFFECTS.boostAttackSpeedMultiplier : PLAYER.attackCooldownMs;
  }

  get projectileDamage(): number {
    return this.turboActive ? PLAYER.boostedProjectileDamage : PLAYER.projectileDamage;
  }

  /** Verdadeiro durante a invulnerabilidade após um golpe ou com o escudo ativo. */
  get isInvulnerable(): boolean {
    return this.invulnerableMs > 0 || this.shieldMs > 0;
  }

  start(): SessionEvent[] {
    return this.beginWave();
  }

  /** Avança o tempo da partida. Retorna os acontecimentos ocorridos neste intervalo. */
  update(dtMs: number): SessionEvent[] {
    if (this.isOver || dtMs <= 0) return [];

    const events: SessionEvent[] = [];
    this.elapsedMs += dtMs;
    this.invulnerableMs = Math.max(0, this.invulnerableMs - dtMs);
    this.turboMs = Math.max(0, this.turboMs - dtMs);
    this.shieldMs = Math.max(0, this.shieldMs - dtMs);

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
        events.push({ type: "spawn", boss: config.isBoss && this.spawnedInWave === 1 });
      }
    }
    return events;
  }

  registerKill(isBoss = false): SessionEvent[] {
    if (this.currentPhase !== "playing") return [];

    this.killedInWave += 1;
    this.currentKills += 1;
    this.currentScore += isBoss ? killPoints(this.currentWave) * BOSS.pointsMultiplier : killPoints(this.currentWave);

    const config = waveConfig(this.currentWave);
    if (this.killedInWave >= config.enemyCount && config.isFinal) {
      // Derrotar o chefe final vence a campanha.
      this.currentPhase = "victory";
      return [{ type: "victory", stats: this.stats() }];
    }
    if (this.killedInWave >= config.enemyCount) {
      this.currentPhase = "intermission";
      this.intermissionMs = WAVES.intermissionMs;
      return [{ type: "waveCleared", wave: this.currentWave }];
    }
    return [];
  }

  /** Aplica dano de contato. Há um período de invulnerabilidade após cada golpe. */
  damagePlayer(amount: number): SessionEvent[] {
    if (this.isOver || this.isInvulnerable || amount <= 0) return [];

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
    if (this.isOver || amount <= 0) return;
    this.currentHp = Math.min(PLAYER.maxHp, this.currentHp + amount);
  }

  /** Ativa o turbo; se já estiver ativo, mantém o maior tempo restante. */
  activateTurbo(durationMs: number): void {
    this.turboMs = Math.max(this.turboMs, durationMs);
  }

  /** Ativa o escudo; se já estiver ativo, mantém o maior tempo restante. */
  activateShield(durationMs: number): void {
    this.shieldMs = Math.max(this.shieldMs, durationMs);
  }

  /** Converte um evento da live em efeitos de jogo, textos para a tela e acontecimentos para a cena. */
  applyLiveEvent(event: LiveEvent): LiveOutcome {
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
        return { feedback, events: [] };
      }
      case "comment": {
        this.currentScore += LIVE_EFFECTS.commentScore;
        return { feedback: [{ text: `${event.userName}: ${event.text}`, tone: "chat" }], events: [] };
      }
      case "gift": {
        this.currentScore += event.diamonds;
        const feedback: LiveFeedback[] = [
          { text: `${event.userName} enviou ${event.giftName} (${event.diamonds})`, tone: "boost" },
        ];
        const power = powerForGift(event.diamonds);
        if (!power || this.isOver) return { feedback, events: [] };

        feedback.push({ text: `PODER ${power.label}`, tone: "power" });
        if (power.turboMs > 0) this.activateTurbo(power.turboMs);
        if (power.shieldMs > 0) this.activateShield(power.shieldMs);
        this.heal(power.heal);
        return { feedback, events: [{ type: "power", power }] };
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
