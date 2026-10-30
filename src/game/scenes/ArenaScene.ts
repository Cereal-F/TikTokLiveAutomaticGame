import Phaser from "phaser";
import type { ConnectionState } from "../../client/net/ReconnectingSocket.js";
import type { LiveEvent } from "../../shared/events.js";
import type { RunOutcome } from "../../shared/protocol.js";
import { Autopilot } from "../core/autopilot.js";
import { PLAYER, PROJECTILE, SHOT, SPEED, WORLD } from "../core/constants.js";
import { GameSession, type SessionEvent, type SessionStats } from "../core/GameSession.js";
import { powerForGift, giftTier, type GiftPower } from "../core/powers.js";
import { edgeSpawnPoint } from "../core/spawnPoints.js";
import { distance, directionTo, findNearest, type Point } from "../core/targeting.js";
import type { Volley } from "../core/enemyBehavior.js";
import { commonBodyFor, isBossWave, type BossConfig, type EnemyKind, type WaveConfig } from "../core/waves.js";
import { Enemy, type EnemyBrainSpec, type EnemySpec } from "../entities/Enemy.js";
import { EnemyShot } from "../entities/EnemyShot.js";
import { Player } from "../entities/Player.js";
import { Projectile } from "../entities/Projectile.js";
import { LiveFeed } from "../net/LiveFeed.js";
import { Hud, type RecordView } from "../ui/Hud.js";
import { SCENE_KEYS } from "./keys.js";
import type { GameOverData } from "./GameOverScene.js";

/** Tamanho máximo do anel visual de um poder de tela inteira (o dano continua valendo para toda a tela). */
const MAX_RING_RADIUS = 900;

/**
 * Cena da partida automática. O personagem é controlado pelo piloto automático: não há
 * entrada do teclado. A cena coordena sessão, entidades, live e HUD.
 * As regras ficam em core/, testadas sem o Phaser.
 */
export class ArenaScene extends Phaser.Scene {
  private session = new GameSession();
  private autopilot = new Autopilot();
  private player!: Player;
  private enemies: Enemy[] = [];
  private enemyShots: EnemyShot[] = [];
  private projectiles: Projectile[] = [];
  private hud!: Hud;
  /** Criado uma vez: a fila de resultados que ainda não chegaram ao servidor sobrevive entre partidas. */
  private liveFeed: LiveFeed | null = null;
  private hudAlive = false;
  private attackCooldownMs = 0;
  private ended = false;
  /** Recorde e contadores vindos do servidor (e atualizados localmente ao fim de cada partida). */
  private record: RecordView = { bestWave: 0, wins: 0, defeats: 0 };
  /** Falso até o servidor enviar o primeiro recorde; a HUD mostra traços até lá. */
  private recordLoaded = false;
  private recordBeatenThisRun = false;

  constructor() {
    super(SCENE_KEYS.arena);
  }

  create(): void {
    this.session = new GameSession();
    this.autopilot = new Autopilot();
    this.enemies = [];
    this.enemyShots = [];
    this.projectiles = [];
    this.attackCooldownMs = 0;
    this.ended = false;
    this.recordBeatenThisRun = false;

    // Efeitos visuais (tweens e atrasos) acompanham a mesma aceleração da partida.
    this.time.timeScale = SPEED.timeScale;
    this.tweens.timeScale = SPEED.timeScale;

    this.add.tileSprite(0, 0, WORLD.width, WORLD.height, "floor").setOrigin(0).setDepth(0);
    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.hud = new Hud(this);
    this.showRecord();

    // Ao encerrar a cena (reinício automático), a conexão é fechada e não deve mais
    // atualizar a HUD, cujos objetos podem já estar sendo destruídos.
    this.hudAlive = true;
    this.liveFeed ??= new LiveFeed((state: ConnectionState) => {
      if (this.hudAlive) this.hud.setConnection(state);
    });
    this.liveFeed.start();
    this.events.once("shutdown", () => {
      this.hudAlive = false;
      this.liveFeed?.stop();
    });

    this.handleSessionEvents(this.session.start());
  }

  update(_time: number, deltaMs: number): void {
    if (this.ended) return;
    // Limita o intervalo (aba em segundo plano) e aplica a aceleração da partida.
    const dt = Math.min(deltaMs, 100) * SPEED.timeScale;

    this.applyServerUpdates();
    for (const event of this.liveFeed?.drain() ?? []) {
      this.handleLiveEvent(event);
    }

    this.handleSessionEvents(this.session.update(dt));
    if (this.ended) return;

    const direction = this.autopilot.steer({
      position: this.player.position,
      enemies: this.aliveEnemies().map((enemy) => enemy.position),
      world: WORLD,
    });
    // A arrancada (dash) aumenta a velocidade máxima; a aceleração suave continua valendo.
    this.player.move(direction, dt, this.autopilot.dashMultiplier(dt));
    this.updateAttack(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    if (this.ended) return;
    this.updateEnemyShots(dt);
    if (this.ended) return;

    this.hud.update({
      hp: this.session.hp,
      maxHp: this.session.maxHp,
      wave: this.session.wave,
      score: this.session.score,
      survivedMs: this.session.survivedMs,
      phase: this.session.phase,
      turboRemainingMs: this.session.turboRemainingMs,
      shieldRemainingMs: this.session.shieldRemainingMs,
    });
  }

  private applyServerUpdates(): void {
    const updates = this.liveFeed?.takeUpdates();
    if (!updates) return;
    if (updates.leaderboard) this.hud.setLeaderboard(updates.leaderboard);
    if (updates.record) {
      this.recordLoaded = true;
      this.record = {
        bestWave: Math.max(this.record.bestWave, updates.record.bestWave),
        wins: updates.record.wins,
        defeats: updates.record.defeats,
      };
      this.showRecord();
    }
  }

  private showRecord(): void {
    this.hud.setRecord(this.recordLoaded ? { ...this.record } : null);
  }

  private handleLiveEvent(event: LiveEvent): void {
    const outcome = this.session.applyLiveEvent(event);
    this.hud.pushFeedback(outcome.feedback);
    if (event.kind === "gift") {
      const power = powerForGift(event.diamonds);
      const suffix = power ? ` > ${power.label}` : "";
      this.hud.pushGift({
        text: `${event.userName}: ${event.giftName} (${event.diamonds})${suffix}`,
        tier: power ? giftTier(power) : 0,
      });
    }
    this.handleSessionEvents(outcome.events);
  }

  private handleSessionEvents(events: SessionEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "spawn":
          this.spawnEnemy(event.boss);
          break;
        case "waveStarted":
          this.onWaveStarted(event.wave);
          break;
        case "waveCleared":
          this.hud.showBanner(`ONDA ${event.wave} CONCLUÍDA`);
          break;
        case "playerHit":
          this.player.flash();
          this.cameras.main.shake(120, 0.004);
          break;
        case "power":
          this.activatePower(event.power);
          break;
        case "victory":
          this.endRun(event.stats, "victory");
          return;
        case "defeated":
          this.endRun(event.stats, "defeat");
          return;
      }
    }
  }

  private onWaveStarted(wave: number): void {
    const config = this.session.waveSettings;
    this.hud.showBanner(waveBanner(wave, config));
    this.liveFeed?.reportWave(wave);
    if (wave > this.record.bestWave) {
      // Só comemora quando há um recorde anterior para superar (evita banner na primeira execução).
      if (this.record.bestWave > 0 && !this.recordBeatenThisRun) {
        this.recordBeatenThisRun = true;
        this.hud.showBanner("NOVO RECORDE!");
      }
      this.record = { ...this.record, bestWave: wave };
      this.showRecord();
    }
  }

  private activatePower(power: GiftPower): void {
    this.hud.showBanner(power.label);
    if (power.blastRadius > 0 && power.blastDamage > 0) {
      const center = Number.isFinite(power.blastRadius) ? this.player.position : { x: WORLD.width / 2, y: WORLD.height / 2 };
      this.detonate(center, power.blastRadius, power.blastDamage, power.kind === "storm" ? 0xff5e7e : 0xffd23f);
    }
  }

  /** Dano em área: atinge todos os inimigos vivos dentro do raio e mostra um anel que se desfaz. */
  private detonate(center: Point, radius: number, damage: number, color: number): void {
    const ringRadius = Math.min(radius, MAX_RING_RADIUS);
    const ring = this.add.circle(center.x, center.y, ringRadius, color, 0.25).setDepth(7);
    this.tweens.add({ targets: ring, alpha: 0, duration: 450, onComplete: () => ring.destroy() });

    const targets = this.aliveEnemies().filter((enemy) => distance(enemy.position, center) <= radius);
    for (const enemy of targets) {
      if (enemy.takeHit(damage)) {
        this.handleSessionEvents(this.session.registerKill(enemy.isBoss));
      }
    }
  }

  private spawnEnemy(boss: boolean): void {
    const config = this.session.waveSettings;
    const point = edgeSpawnPoint(() => Math.random(), WORLD);
    const spec = boss && config.boss ? bossSpec(config.boss) : commonSpec(config);
    this.enemies.push(new Enemy(this, point.x, point.y, spec));
  }

  private aliveEnemies(): Enemy[] {
    return this.enemies.filter((enemy) => enemy.isAlive);
  }

  private updateAttack(dt: number): void {
    this.attackCooldownMs -= dt;
    if (this.attackCooldownMs > 0) return;

    const origin = this.player.position;
    const target = findNearest(origin, this.aliveEnemies(), PLAYER.attackRange);
    if (!target) return;

    this.attackCooldownMs = this.session.attackCooldownMs;
    const direction = directionTo(origin, target);
    this.projectiles.push(new Projectile(this, origin, direction, this.session.projectileDamage));
  }

  private updateProjectiles(dt: number): void {
    const remaining: Projectile[] = [];
    for (const projectile of this.projectiles) {
      if (!projectile.advance(dt)) {
        projectile.destroy();
        continue;
      }

      const hit = this.enemies.find(
        (enemy) => enemy.isAlive && distance(enemy.position, projectile.position) < enemy.radius + PROJECTILE.radius,
      );
      if (hit) {
        const defeated = hit.takeHit(projectile.damage);
        projectile.destroy();
        if (defeated) this.handleSessionEvents(this.session.registerKill(hit.isBoss));
        continue;
      }
      remaining.push(projectile);
    }
    this.projectiles = remaining;
  }

  private updateEnemies(dt: number): void {
    const playerPosition = this.player.position;
    const alive = this.aliveEnemies();
    // Posições de todos os vivos, para a separação; cada inimigo ignora a própria posição.
    const positions = alive.map((enemy) => enemy.position);
    for (const enemy of alive) {
      const volleys = enemy.act(playerPosition, positions, dt);
      for (const volley of volleys) this.fireVolley(enemy.position, volley);
      if (distance(enemy.position, playerPosition) < enemy.radius + PLAYER.radius) {
        this.handleSessionEvents(this.session.damagePlayer(enemy.contactDamage));
        if (this.ended) return;
      }
    }
    this.enemies = this.aliveEnemies();
  }

  private fireVolley(origin: Point, volley: Volley): void {
    for (const direction of volley.directions) {
      this.enemyShots.push(new EnemyShot(this, origin, direction, volley.speed, volley.damage));
    }
  }

  /** Tiros inimigos: avançam em linha reta e causam dano ao personagem se o acertarem. */
  private updateEnemyShots(dt: number): void {
    const remaining: EnemyShot[] = [];
    for (const shot of this.enemyShots) {
      if (!shot.advance(dt)) {
        shot.destroy();
        continue;
      }
      if (distance(shot.position, this.player.position) < SHOT.radius + PLAYER.radius) {
        shot.destroy();
        this.handleSessionEvents(this.session.damagePlayer(shot.damage));
        if (this.ended) return;
        continue;
      }
      remaining.push(shot);
    }
    this.enemyShots = remaining;
  }

  private endRun(stats: SessionStats, outcome: RunOutcome): void {
    this.ended = true;
    this.record = {
      ...this.record,
      wins: this.record.wins + (outcome === "victory" ? 1 : 0),
      defeats: this.record.defeats + (outcome === "defeat" ? 1 : 0),
    };
    // Envia o resultado ao servidor antes do reinício; se a conexão estiver fora, fica na fila.
    this.liveFeed?.reportRunEnded(outcome);
    const data: GameOverData = {
      ...stats,
      outcome,
      wins: this.record.wins,
      defeats: this.record.defeats,
      bestWave: this.record.bestWave,
      newRecord: this.recordBeatenThisRun,
    };
    this.scene.start(SCENE_KEYS.gameOver, data);
  }
}

/** Banner de entrada de cada onda: chefe com nome próprio, chefe final e ondas comuns. */
function waveBanner(wave: number, config: WaveConfig): string {
  if (config.isFinal) return "CHEFE FINAL!";
  if (isBossWave(wave) && config.boss) return `CHEFE: ${config.boss.design.name}`;
  return `ONDA ${wave}`;
}

/** Inimigo comum: corpo e comportamento conforme o tipo da onda. */
function commonSpec(config: WaveConfig): EnemySpec {
  const body = commonBodyFor(config.kind);
  return {
    hp: config.enemyHp,
    speed: config.enemySpeed,
    radius: body.radius,
    contactDamage: body.contactDamage,
    isBoss: false,
    texture: body.texture,
    brain: brainFor(config.kind),
  };
}

/** Chefe: atributos e padrões de ataque do desenho dele. */
function bossSpec(boss: BossConfig): EnemySpec {
  return {
    hp: boss.hp,
    speed: boss.speed,
    radius: boss.radius,
    contactDamage: boss.contactDamage,
    isBoss: true,
    texture: boss.design.texture,
    brain: { kind: "boss", design: boss.design },
  };
}

function brainFor(kind: EnemyKind): EnemyBrainSpec {
  switch (kind) {
    case "shooter":
      return { kind: "shooter" };
    case "charger":
      return { kind: "charger" };
    case "virus":
    case "tank":
      return { kind: "chase" };
  }
}
