import Phaser from "phaser";
import type { ConnectionState } from "../../client/net/ReconnectingSocket.js";
import type { LiveEvent } from "../../shared/events.js";
import { Autopilot } from "../core/autopilot.js";
import { ENEMY, PLAYER, PROJECTILE, SPEED, WORLD } from "../core/constants.js";
import { GameSession, type SessionEvent, type SessionStats } from "../core/GameSession.js";
import { giftTier, powerForGift, type GiftPower } from "../core/powers.js";
import { edgeSpawnPoint } from "../core/spawnPoints.js";
import { distance, directionTo, findNearest, type Point } from "../core/targeting.js";
import { isBossWave } from "../core/waves.js";
import { Enemy, type EnemySpec } from "../entities/Enemy.js";
import { Player } from "../entities/Player.js";
import { Projectile } from "../entities/Projectile.js";
import { LiveFeed } from "../net/LiveFeed.js";
import { Hud } from "../ui/Hud.js";
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
  private projectiles: Projectile[] = [];
  private hud!: Hud;
  private liveFeed!: LiveFeed;
  private attackCooldownMs = 0;
  private ended = false;
  /** Maior onda conhecida (vinda do servidor ou desta execução). Persiste entre partidas. */
  private bestWave = 0;
  private recordBeatenThisRun = false;

  constructor() {
    super(SCENE_KEYS.arena);
  }

  create(): void {
    this.session = new GameSession();
    this.autopilot = new Autopilot();
    this.enemies = [];
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
    this.hud.setRecord(this.bestWave > 0 ? this.bestWave : null);

    // Ao encerrar a cena (reinício automático), a conexão é fechada e não deve mais
    // atualizar a HUD, cujos objetos podem já estar sendo destruídos.
    let sceneActive = true;
    this.liveFeed = new LiveFeed((state: ConnectionState) => {
      if (sceneActive) this.hud.setConnection(state);
    });
    this.liveFeed.start();
    this.events.once("shutdown", () => {
      sceneActive = false;
      this.liveFeed.stop();
    });

    this.handleSessionEvents(this.session.start());
  }

  update(_time: number, deltaMs: number): void {
    if (this.ended) return;
    // Limita o intervalo (aba em segundo plano) e aplica a aceleração da partida.
    const dt = Math.min(deltaMs, 100) * SPEED.timeScale;

    this.applyServerUpdates();
    for (const event of this.liveFeed.drain()) {
      this.handleLiveEvent(event);
    }

    this.handleSessionEvents(this.session.update(dt));
    if (this.ended) return;

    const direction = this.autopilot.steer({
      position: this.player.position,
      enemies: this.aliveEnemies().map((enemy) => enemy.position),
      world: WORLD,
    });
    // Arrancadas curtas (dash) quebram a órbita constante em torno dos inimigos.
    this.player.move(direction, dt * this.autopilot.dashMultiplier(dt));
    this.updateAttack(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
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
    const updates = this.liveFeed.takeUpdates();
    if (updates.leaderboard) this.hud.setLeaderboard(updates.leaderboard);
    if (updates.record) {
      this.bestWave = Math.max(this.bestWave, updates.record.bestWave);
      this.hud.setRecord(this.bestWave);
    }
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
        case "defeated":
          this.endRun(event.stats);
          return;
      }
    }
  }

  private onWaveStarted(wave: number): void {
    this.hud.showBanner(isBossWave(wave) ? `CHEFE! ONDA ${wave}` : `ONDA ${wave}`);
    this.liveFeed.reportWave(wave);
    if (wave > this.bestWave) {
      // Só comemora quando há um recorde anterior para superar (evita banner na primeira execução).
      if (this.bestWave > 0 && !this.recordBeatenThisRun) {
        this.recordBeatenThisRun = true;
        this.hud.showBanner("NOVO RECORDE!");
      }
      this.bestWave = wave;
      this.hud.setRecord(this.bestWave);
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
    const spec: EnemySpec =
      boss && config.boss
        ? {
            hp: config.boss.hp,
            speed: config.boss.speed,
            radius: config.boss.radius,
            contactDamage: config.boss.contactDamage,
            isBoss: true,
          }
        : {
            hp: config.enemyHp,
            speed: config.enemySpeed,
            radius: ENEMY.radius,
            contactDamage: ENEMY.contactDamage,
            isBoss: false,
          };
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
      enemy.chase(playerPosition, positions, dt);
      if (distance(enemy.position, playerPosition) < enemy.radius + PLAYER.radius) {
        this.handleSessionEvents(this.session.damagePlayer(enemy.contactDamage));
        if (this.ended) return;
      }
    }
    this.enemies = this.aliveEnemies();
  }

  private endRun(stats: SessionStats): void {
    this.ended = true;
    const data: GameOverData = {
      ...stats,
      bestWave: this.bestWave,
      newRecord: this.recordBeatenThisRun,
    };
    this.scene.start(SCENE_KEYS.gameOver, data);
  }
}
