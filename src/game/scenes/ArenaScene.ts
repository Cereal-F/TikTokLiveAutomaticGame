import Phaser from "phaser";
import type { LiveEvent } from "../../shared/events.js";
import type { GameCommand, Podium, RunOutcome } from "../../shared/protocol.js";
import { Autopilot } from "../core/autopilot.js";
import { PLAYER, PROJECTILE, SHOT, SPEED, WORLD } from "../core/constants.js";
import { GameSession, type SessionEvent, type SessionStats } from "../core/GameSession.js";
import { powerForGift, giftTier, type GiftPower } from "../core/powers.js";
import { SpotlightQueue, type Spotlight } from "../core/spotlight.js";
import { edgeSpawnPoint } from "../core/spawnPoints.js";
import { distance, directionTo, findNearest, type Point } from "../core/targeting.js";
import type { Volley } from "../core/enemyBehavior.js";
import { commonBodyFor, isBossWave, type BossConfig, type EnemyKind, type WaveConfig } from "../core/waves.js";
import { chapterForWave } from "../core/scenery.js";
import { Enemy, type EnemyBrainSpec, type EnemySpec } from "../entities/Enemy.js";
import { EnemyShot } from "../entities/EnemyShot.js";
import { Player } from "../entities/Player.js";
import { Projectile } from "../entities/Projectile.js";
import { LiveFeed } from "../net/LiveFeed.js";
import { Hud, type RecordView } from "../ui/Hud.js";
import { SpotlightView } from "../ui/SpotlightView.js";
import { ChapterTransition } from "../ui/ChapterTransition.js";
import { burst, flash, shockwave } from "../ui/effects.js";
import { type Chapter } from "../core/scenery.js";
import { SCENE_KEYS } from "./keys.js";
import type { GameOverData } from "./GameOverScene.js";

const EMPTY_PODIUM: Podium = { basis: "diamonds", entries: [] };

/** Cor de cada nível de presente, igual à da faixa de avisos. */
const TIER_COLORS: Record<number, number> = { 1: 0xb36bff, 2: 0x67e8f9, 3: 0xff9f43, 4: 0xff5e7e };

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
  /** Avisos no meio da tela (quem enviou, o presente e o efeito), um por vez. */
  private spotlights = new SpotlightQueue();
  private spotlightView: SpotlightView | null = null;
  private shownSpotlight: Spotlight | null = null;
  private attackCooldownMs = 0;
  private ended = false;
  /** Recorde e contadores vindos do servidor (e atualizados localmente ao fim de cada partida). */
  private record: RecordView = { bestWave: 0, wins: 0, defeats: 0 };
  /** Falso até o servidor enviar o primeiro recorde; a HUD mostra traços até lá. */
  private recordLoaded = false;
  private recordBeatenThisRun = false;
  /** Pódio mais recente recebido do servidor; vai para a tela de fim de partida. */
  private podium: Podium = EMPTY_PODIUM;
  private floor: Phaser.GameObjects.TileSprite | null = null;
  private chapterIndex = 0;
  /** Cor do capítulo atual: tinge as explosões de inimigos comuns. */
  private chapterColor = 0x3a7bff;
  /** Aura do personagem (escudo, fúria e turbo), redesenhada a cada quadro. */
  private aura: Phaser.GameObjects.Graphics | null = null;
  /** Verdadeiro durante a troca de capítulo: o jogo para e a tela mostra a transição. */
  private transitioning = false;
  private chapterTransition: ChapterTransition | null = null;

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
    this.spotlights = new SpotlightQueue();
    this.shownSpotlight = null;
    this.podium = EMPTY_PODIUM;
    this.chapterIndex = 0;
    this.transitioning = false;

    // Efeitos visuais (tweens e atrasos) acompanham a mesma aceleração da partida.
    this.time.timeScale = SPEED.timeScale;
    this.tweens.timeScale = SPEED.timeScale;

    this.floor = this.add.tileSprite(0, 0, WORLD.width, WORLD.height, "floor").setOrigin(0).setDepth(0);
    this.chapterTransition = new ChapterTransition(this);
    this.aura = this.add.graphics().setDepth(6);
    this.applyChapter(chapterForWave(1));
    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.hud = new Hud(this);
    this.showRecord();

    // A conexão com a live fica só no servidor; a tela não mostra o estado dela.
    this.liveFeed ??= new LiveFeed(() => undefined);
    this.liveFeed.start();
    // Cada partida é uma rodada nova: o servidor zera o top de presenteadores da rodada.
    this.liveFeed.reportRunStarted();
    this.spotlightView = new SpotlightView(this);
    this.events.once("shutdown", () => {
      this.liveFeed?.stop();
      this.spotlightView?.destroy();
      this.spotlightView = null;
      this.shownSpotlight = null;
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
    // Durante a troca de capítulo a partida para: a sessão, os inimigos e o personagem esperam.
    if (this.transitioning) {
      this.updateSpotlight();
      return;
    }
    // Comandos do painel (pular ou escolher onda) valem entre quadros, depois da troca de capítulo.
    for (const command of this.liveFeed?.takeCommands() ?? []) {
      this.applyCommand(command);
    }
    if (this.ended) return;

    this.handleSessionEvents(this.session.update(dt));
    if (this.ended) return;

    const direction = this.autopilot.steer({
      position: this.player.position,
      enemies: this.aliveEnemies().map((enemy) => enemy.position),
      world: WORLD,
    });
    // A arrancada (dash) aumenta a velocidade máxima; a aceleração suave continua valendo.
    // A fúria deixa o personagem mais rápido; a arrancada aumenta a velocidade máxima.
    this.player.move(direction, dt, this.autopilot.dashMultiplier(dt) * this.session.moveMultiplier);
    this.updateAttack(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    if (this.ended) return;
    this.updateEnemyShots(dt);
    if (this.ended) return;
    this.updateSpotlight();
    this.updateAura();

    this.hud.update({
      hp: this.session.hp,
      maxHp: this.session.maxHp,
      wave: this.session.wave,
      score: this.session.score,
      survivedMs: this.session.survivedMs,
      phase: this.session.phase,
      turboRemainingMs: this.session.turboRemainingMs,
      shieldRemainingMs: this.session.shieldRemainingMs,
      shieldHp: this.session.shieldHp,
      shieldMaxHp: this.session.shieldMaxHp,
      berserkRemainingMs: this.session.berserkRemainingMs,
    });
  }

  /** Mostra o aviso da fila que está na vez; troca só quando o aviso atual terminou. */
  private updateSpotlight(): void {
    const item = this.spotlights.tick(this.time.now);
    if (item === this.shownSpotlight) return;
    this.shownSpotlight = item;
    if (item) this.spotlightView?.show(item);
    else this.spotlightView?.hide();
  }

  private applyServerUpdates(): void {
    const updates = this.liveFeed?.takeUpdates();
    if (!updates) return;
    if (updates.leaderboard) this.hud.setLeaderboard(updates.leaderboard, updates.allTime ?? null);
    if (updates.podium) this.podium = updates.podium;
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
    if (outcome.spotlight) this.spotlights.push(outcome.spotlight);
    if (event.kind === "gift") {
      const power = powerForGift(event.diamonds);
      if (power) this.giftFlare(power);
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
          if (isBossWave(event.wave)) {
            this.beginChapterTransition(event.wave + 1);
          } else {
            this.hud.showBanner(`ONDA ${event.wave} CONCLUÍDA`);
          }
          break;
        case "playerHit":
          this.player.flash();
          this.cameras.main.shake(120, 0.004);
          break;
        case "shieldHit": {
          // O escudo segurou o golpe: anel ciano no personagem (e pedaços se ele caiu).
          const at = this.player.position;
          shockwave(this, at.x, at.y, 52, 0x67e8f9, 300, 4);
          if (event.broken) burst(this, at.x, at.y, { color: 0x67e8f9, count: 14, speed: 160, size: 5, lifeMs: 500 });
          break;
        }
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

  /** Pular ou escolher onda (testes): a onda nova começa limpa, com o cenário do capítulo dela. */
  private applyCommand(command: GameCommand): void {
    const events =
      command.kind === "skipWave" ? this.session.skipWave() : this.session.jumpToWave(command.wave);
    if (events.some((event) => event.type === "waveStarted")) {
      for (const enemy of this.enemies) enemy.destroy();
      this.enemies = [];
      for (const shot of this.enemyShots) shot.destroy();
      this.enemyShots = [];
      for (const projectile of this.projectiles) projectile.destroy();
      this.projectiles = [];
      this.applyChapter(chapterForWave(this.session.wave));
    }
    this.handleSessionEvents(events);
  }

  /**
   * Depois de um chefe, a próxima onda pode abrir um capítulo novo: o cenário muda com uma transição.
   * Os tiros pendentes somem para o novo capítulo começar limpo.
   */
  private beginChapterTransition(nextWave: number): void {
    const chapter = chapterForWave(nextWave);
    if (chapter.index === this.chapterIndex || !this.chapterTransition) return;
    this.transitioning = true;
    this.hud.showBanner("CHEFE DERROTADO!");
    for (const shot of this.enemyShots) shot.destroy();
    this.enemyShots = [];
    this.chapterTransition.play(
      chapter,
      () => this.applyChapter(chapter),
      () => {
        this.transitioning = false;
      },
    );
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
  /** Troca o cenário e a cor do capítulo. Chamado no escuro da transição, ou direto ao pular de onda. */
  private applyChapter(chapter: Chapter): void {
    this.floor?.setTexture(chapter.floorKey);
    this.chapterIndex = chapter.index;
    this.chapterColor = chapter.color;
  }

  /** Inimigo derrotado: explosão (maior no chefe) e a contagem da sessão. */
  private onEnemyDefeated(enemy: Enemy): void {
    this.explodeEnemy(enemy.position, enemy.isBoss);
    this.handleSessionEvents(this.session.registerKill(enemy.isBoss));
  }

  private explodeEnemy(at: Point, boss: boolean): void {
    if (boss) {
      flash(this, 0xffffff, 0.55, 320);
      shockwave(this, at.x, at.y, 170, 0xffd23f, 520, 8);
      shockwave(this, at.x, at.y, 320, this.chapterColor, 820, 5);
      burst(this, at.x, at.y, { color: 0xffd23f, count: 42, speed: 380, size: 9, lifeMs: 950 });
      burst(this, at.x, at.y, { color: this.chapterColor, count: 26, speed: 280, size: 6, lifeMs: 750 });
      this.cameras.main.shake(380, 0.012);
      return;
    }
    shockwave(this, at.x, at.y, 46, this.chapterColor, 260, 3);
    burst(this, at.x, at.y, { color: this.chapterColor, count: 10, speed: 150, size: 5, lifeMs: 420 });
  }

  /** Presente que ativa um poder: anel e pedaços na cor do nível, mais forte nos níveis altos. */
  private giftFlare(power: GiftPower): void {
    const tier = giftTier(power);
    const color = TIER_COLORS[tier] ?? TIER_COLORS[1]!;
    const at = this.player.position;
    shockwave(this, at.x, at.y, 70 + tier * 25, color, 450, 5);
    burst(this, at.x, at.y, { color, count: 10 + tier * 4, speed: 140 + tier * 30, size: 5, lifeMs: 600 });
    if (tier >= 3) flash(this, color, 0.25, 350);
    if (tier >= 4) this.cameras.main.shake(300, 0.006);
  }

  /** Aura do personagem enquanto um efeito dura: escudo (ciano), fúria (vermelho) e turbo (roxo). */
  private updateAura(): void {
    const graphics = this.aura;
    if (!graphics) return;
    graphics.clear();
    const at = this.player.position;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 120);
    if (this.session.shieldActive) {
      graphics.lineStyle(4, 0x67e8f9, 0.5 + 0.4 * pulse).strokeCircle(at.x, at.y, 34 + pulse * 4);
    }
    if (this.session.berserkActive) {
      graphics.lineStyle(5, 0xff5e7e, 0.45 + 0.4 * pulse).strokeCircle(at.x, at.y, 30 + pulse * 6);
    }
    if (this.session.turboActive) {
      graphics.lineStyle(3, 0xb36bff, 0.5).strokeCircle(at.x, at.y, 26 + pulse * 3);
    }
  }

  private detonate(center: Point, radius: number, damage: number, color: number): void {
    const ringRadius = Math.min(radius, MAX_RING_RADIUS);
    const ring = this.add.circle(center.x, center.y, ringRadius, color, 0.25).setDepth(7);
    this.tweens.add({ targets: ring, alpha: 0, duration: 450, onComplete: () => ring.destroy() });

    const targets = this.aliveEnemies().filter((enemy) => distance(enemy.position, center) <= radius);
    for (const enemy of targets) {
      if (enemy.takeHit(damage)) {
        this.onEnemyDefeated(enemy);
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
        if (defeated) this.onEnemyDefeated(hit);
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
      podium: this.podium,
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
