import Phaser from "phaser";
import type { ConnectionState } from "../../client/net/ReconnectingSocket.js";
import { ENEMY, PLAYER, PROJECTILE, WORLD } from "../core/constants.js";
import { GameSession, type SessionEvent, type SessionStats } from "../core/GameSession.js";
import { edgeSpawnPoint } from "../core/spawnPoints.js";
import { distance, directionTo, findNearest, type Point } from "../core/targeting.js";
import { Enemy } from "../entities/Enemy.js";
import { Player } from "../entities/Player.js";
import { Projectile } from "../entities/Projectile.js";
import { LiveFeed } from "../net/LiveFeed.js";
import { Hud } from "../ui/Hud.js";
import { SCENE_KEYS } from "./keys.js";

type KeyMap = Record<string, Phaser.Input.Keyboard.Key>;

/**
 * Cena da partida. Coordena entrada, sessão, entidades e HUD.
 * As regras ficam em core/ (GameSession, waves, targeting), testadas sem o Phaser.
 */
export class ArenaScene extends Phaser.Scene {
  private session = new GameSession();
  private player!: Player;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private hud!: Hud;
  private liveFeed!: LiveFeed;
  private keys: KeyMap = {};
  private attackCooldownMs = 0;
  private ended = false;

  constructor() {
    super(SCENE_KEYS.arena);
  }

  create(): void {
    this.session = new GameSession();
    this.enemies = [];
    this.projectiles = [];
    this.attackCooldownMs = 0;
    this.ended = false;

    this.add.tileSprite(0, 0, WORLD.width, WORLD.height, "floor").setOrigin(0).setDepth(0);
    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.hud = new Hud(this);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keys = keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as KeyMap;
    }

    // Ao encerrar a cena (por exemplo, ao reiniciar a partida), a conexão é fechada e
    // não deve mais atualizar a HUD, cujos objetos podem já estar sendo destruídos.
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
    // Limita o intervalo para evitar saltos quando a aba ou a janela ficam em segundo plano.
    const dt = Math.min(deltaMs, 100);

    for (const event of this.liveFeed.drain()) {
      this.hud.pushFeedback(this.session.applyLiveEvent(event));
    }

    this.handleSessionEvents(this.session.update(dt));
    if (this.ended) return;

    this.player.move(this.readMoveInput(), dt);
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
      boostActive: this.session.boostActive,
    });
  }

  private handleSessionEvents(events: SessionEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "spawn":
          this.spawnEnemy();
          break;
        case "waveStarted":
          this.hud.showBanner(`ONDA ${event.wave}`);
          break;
        case "waveCleared":
          this.hud.showBanner(`ONDA ${event.wave} CONCLUÍDA`);
          break;
        case "playerHit":
          this.player.flash();
          this.cameras.main.shake(120, 0.004);
          break;
        case "defeated":
          this.endRun(event.stats);
          return;
      }
    }
  }

  private spawnEnemy(): void {
    const config = this.session.waveSettings;
    const point = edgeSpawnPoint(() => Math.random(), WORLD);
    this.enemies.push(new Enemy(this, point.x, point.y, config.enemyHp, config.enemySpeed));
  }

  private updateAttack(dt: number): void {
    this.attackCooldownMs -= dt;
    if (this.attackCooldownMs > 0) return;

    const origin = this.player.position;
    const target = findNearest(origin, this.enemies.filter((enemy) => enemy.isAlive), PLAYER.attackRange);
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
        (enemy) => enemy.isAlive && distance(enemy.position, projectile.position) < ENEMY.radius + PROJECTILE.radius,
      );
      if (hit) {
        const defeated = hit.takeHit(projectile.damage);
        projectile.destroy();
        if (defeated) this.handleSessionEvents(this.session.registerKill());
        continue;
      }
      remaining.push(projectile);
    }
    this.projectiles = remaining;
  }

  private updateEnemies(dt: number): void {
    const playerPosition = this.player.position;
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      enemy.chase(playerPosition, dt);
      if (distance(enemy.position, playerPosition) < ENEMY.radius + PLAYER.radius) {
        this.handleSessionEvents(this.session.damagePlayer(ENEMY.contactDamage));
        if (this.ended) return;
      }
    }
    this.enemies = this.enemies.filter((enemy) => enemy.isAlive);
  }

  private readMoveInput(): Point {
    const x = (this.isAnyDown("D", "RIGHT") ? 1 : 0) - (this.isAnyDown("A", "LEFT") ? 1 : 0);
    const y = (this.isAnyDown("S", "DOWN") ? 1 : 0) - (this.isAnyDown("W", "UP") ? 1 : 0);
    const length = Math.hypot(x, y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
  }

  private isAnyDown(...names: string[]): boolean {
    return names.some((name) => this.keys[name]?.isDown === true);
  }

  private endRun(stats: SessionStats): void {
    this.ended = true;
    this.scene.start(SCENE_KEYS.gameOver, stats);
  }
}
