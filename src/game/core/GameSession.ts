import type { LiveEvent } from "../../shared/events.js";
import { BERSERK, BOSS, EFFECT_CAP_MS, LIVE_EFFECTS, PLAYER, WAVES } from "./constants.js";
import { effectText, giftTier, grantFor, HITKILL_DAMAGE, powerForGift, type GiftPower } from "./powers.js";
import { likeTitle, type Spotlight } from "./spotlight.js";
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
  /** `count` são as unidades do presente; a explosão e a cura valem uma vez. */
  | { type: "power"; power: GiftPower; count: number }
  | { type: "defeated"; stats: SessionStats }
  | { type: "victory"; stats: SessionStats };

/** Texto curto mostrado na tela em resposta a um evento da live. */
export interface LiveFeedback {
  text: string;
  tone: "score" | "heal" | "boost" | "chat" | "power";
}

/** Resultado de aplicar um evento da live: textos para a tela, acontecimentos para a cena e o aviso central. */
export interface LiveOutcome {
  feedback: LiveFeedback[];
  events: SessionEvent[];
  spotlight?: Spotlight;
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
  private berserkMs = 0;
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

  get berserkActive(): boolean {
    return this.berserkMs > 0;
  }

  get berserkRemainingMs(): number {
    return this.berserkMs;
  }

  /** Multiplicador de velocidade de movimento (a fúria deixa o personagem mais rápido). */
  get moveMultiplier(): number {
    return this.berserkActive ? BERSERK.moveMultiplier : 1;
  }

  get attackCooldownMs(): number {
    if (this.berserkActive) return BERSERK.attackCooldownMs;
    return this.turboActive ? PLAYER.attackCooldownMs / LIVE_EFFECTS.boostAttackSpeedMultiplier : PLAYER.attackCooldownMs;
  }

  get projectileDamage(): number {
    if (this.berserkActive) return HITKILL_DAMAGE;
    return this.turboActive ? PLAYER.boostedProjectileDamage : PLAYER.projectileDamage;
  }

  /** Verdadeiro durante a invulnerabilidade após um golpe, com o escudo ou com a fúria. */
  get isInvulnerable(): boolean {
    return this.invulnerableMs > 0 || this.shieldMs > 0 || this.berserkMs > 0;
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
    this.berserkMs = Math.max(0, this.berserkMs - dtMs);

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

  /** Turbo: o tempo se soma ao que já existe, até o teto de EFFECT_CAP_MS. */
  activateTurbo(durationMs: number): void {
    this.turboMs = Math.min(EFFECT_CAP_MS, this.turboMs + durationMs);
  }

  /** Escudo: o tempo se soma ao que já existe, até o teto de EFFECT_CAP_MS. */
  activateShield(durationMs: number): void {
    this.shieldMs = Math.min(EFFECT_CAP_MS, this.shieldMs + durationMs);
  }

  /** Fúria: o tempo se soma ao que já existe, até o teto de EFFECT_CAP_MS. */
  activateBerserk(durationMs: number): void {
    this.berserkMs = Math.min(EFFECT_CAP_MS, this.berserkMs + durationMs);
  }

  /** Converte um evento da live em efeitos de jogo, textos para a tela, acontecimentos e o aviso central. */
  applyLiveEvent(event: LiveEvent): LiveOutcome {
    switch (event.kind) {
      case "like": {
        this.likeProgress += event.count;
        this.currentScore += event.count;
        const feedback: LiveFeedback[] = [{ text: `+${event.count} curtidas`, tone: "score" }];
        let healed = 0;
        while (this.likeProgress >= LIVE_EFFECTS.likesPerHeal) {
          this.likeProgress -= LIVE_EFFECTS.likesPerHeal;
          this.heal(LIVE_EFFECTS.likeHealAmount);
          healed += LIVE_EFFECTS.likeHealAmount;
          feedback.push({ text: `Cura +${LIVE_EFFECTS.likeHealAmount}`, tone: "heal" });
        }
        const spotlight: Spotlight = {
          kind: "like",
          userId: event.userId,
          userName: event.userName,
          ...(event.avatarUrl ? { avatarUrl: event.avatarUrl } : {}),
          title: likeTitle(event.count),
          effect: healed > 0 ? `Cura +${healed}` : "",
          tier: 0,
          count: event.count,
        };
        return { feedback, events: [], spotlight };
      }
      case "comment": {
        this.currentScore += LIVE_EFFECTS.commentScore;
        return { feedback: [{ text: `${event.userName}: ${event.text}`, tone: "chat" }], events: [] };
      }
      case "gift": {
        this.currentScore += event.diamonds;
        // O poder vem do valor de UMA unidade: 20 rosas são 20 rosas, cada uma com seu turbo.
        const count = Math.max(1, event.count ?? 1);
        const power = powerForGift(Math.floor(event.diamonds / count));
        const feedback: LiveFeedback[] = [
          {
            text: `${event.userName} enviou ${count > 1 ? `${count}x ` : ""}${event.giftName} (${event.diamonds})`,
            tone: "boost",
          },
        ];
        const spotlight: Spotlight = {
          kind: "gift",
          userId: event.userId,
          userName: event.userName,
          ...(event.avatarUrl ? { avatarUrl: event.avatarUrl } : {}),
          title: count > 1 ? `${count}x ${event.giftName}` : event.giftName,
          effect: power ? effectText(power, count) : "",
          tier: power ? giftTier(power) : 0,
          count,
        };
        if (!power || this.isOver) return { feedback, events: [], spotlight };

        feedback.push({ text: `PODER ${power.label}`, tone: "power" });
        const grant = grantFor(power, count);
        this.activateTurbo(grant.turboMs);
        this.activateShield(grant.shieldMs);
        this.activateBerserk(grant.berserkMs);
        this.heal(power.heal);
        return { feedback, events: [{ type: "power", power, count }], spotlight };
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
