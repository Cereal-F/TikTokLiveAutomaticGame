import type Phaser from "phaser";
import type { BossDesign } from "../core/bosses.js";
import { ENEMY_TYPES } from "../core/constants.js";
import { BossBrain, ChargerBrain, ShooterBrain, type Volley } from "../core/enemyBehavior.js";
import { chaseDirection } from "../core/enemyMovement.js";
import { directionTo, type Point } from "../core/targeting.js";

/** Como o inimigo se comporta. "chase" persegue; os demais têm um cérebro próprio. */
export type EnemyBrainSpec =
  | { kind: "chase" }
  | { kind: "shooter" }
  | { kind: "charger" }
  | { kind: "boss"; design: BossDesign };

/** Atributos de um inimigo comum ou de um chefe, vindos da configuração da onda. */
export interface EnemySpec {
  hp: number;
  speed: number;
  radius: number;
  contactDamage: number;
  isBoss: boolean;
  /** Textura do Phaser usada no desenho. */
  texture: string;
  brain: EnemyBrainSpec;
}

const BAR_WIDTH = 64;
const BAR_HEIGHT = 6;

type Brain = ShooterBrain | ChargerBrain | BossBrain | null;

function createBrain(spec: EnemyBrainSpec): Brain {
  switch (spec.kind) {
    case "shooter":
      return new ShooterBrain();
    case "charger":
      return new ChargerBrain();
    case "boss":
      return new BossBrain(spec.design);
    case "chase":
      return null;
  }
}

/** Inimigo que age sobre o personagem. O chefe mostra uma barra de vida acima dele. */
export class Enemy {
  readonly sprite: Phaser.GameObjects.Image;
  readonly radius: number;
  readonly contactDamage: number;
  readonly isBoss: boolean;
  private remainingHp: number;
  private readonly maxHp: number;
  private readonly speed: number;
  private readonly brain: Brain;
  private alive = true;
  private readonly barBack: Phaser.GameObjects.Rectangle | null = null;
  private readonly barFill: Phaser.GameObjects.Rectangle | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, spec: EnemySpec) {
    this.remainingHp = spec.hp;
    this.maxHp = spec.hp;
    this.speed = spec.speed;
    this.radius = spec.radius;
    this.contactDamage = spec.contactDamage;
    this.isBoss = spec.isBoss;
    this.brain = createBrain(spec.brain);
    this.sprite = scene.add.image(x, y, spec.texture).setDepth(spec.isBoss ? 6 : 5);
    if (spec.isBoss) {
      this.barBack = scene.add.rectangle(x, y, BAR_WIDTH, BAR_HEIGHT, 0x000000, 0.7).setDepth(20);
      this.barFill = scene.add.rectangle(x, y, BAR_WIDTH, BAR_HEIGHT, 0xf87171).setDepth(21);
      this.placeBar();
    }
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get position(): Point {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /**
   * Avança um quadro em direção ao alvo e devolve os tiros disparados neste quadro.
   * `others` são as posições de todos os inimigos vivos (a separação evita formarem um bloco).
   */
  act(target: Point, others: readonly Point[], dtMs: number): Volley[] {
    if (!this.alive) return [];
    const self = this.position;
    const volleys: Volley[] = [];
    let direction: Point;
    let speedFactor = 1;

    if (this.brain instanceof ShooterBrain) {
      const intent = this.brain.step(self, target, others, dtMs);
      direction = intent.direction;
      speedFactor = intent.speedFactor;
      if (intent.fire) {
        volleys.push({
          directions: [directionTo(self, target)],
          speed: ENEMY_TYPES.shooter.shotSpeed,
          damage: ENEMY_TYPES.shooter.shotDamage,
        });
      }
    } else if (this.brain instanceof ChargerBrain) {
      const intent = this.brain.step(self, target, others, dtMs);
      direction = intent.direction;
      speedFactor = intent.speedFactor;
    } else if (this.brain instanceof BossBrain) {
      const intent = this.brain.step(self, target, others, dtMs);
      direction = intent.direction;
      speedFactor = intent.speedFactor;
      volleys.push(...intent.volleys);
    } else {
      direction = chaseDirection(self, target, others);
    }

    const step = (this.speed * speedFactor * dtMs) / 1000;
    this.sprite.setPosition(self.x + direction.x * step, self.y + direction.y * step);
    this.placeBar();
    return volleys;
  }

  /** Aplica dano. Retorna true se o inimigo foi derrotado por este golpe. */
  takeHit(damage: number): boolean {
    if (!this.alive) return false;
    this.remainingHp -= damage;
    this.updateBar();
    if (this.remainingHp > 0) {
      this.sprite.setTint(0xffffff);
      this.sprite.scene.time.delayedCall(80, () => this.alive && this.sprite.clearTint());
      return false;
    }
    this.alive = false;
    this.removeBar();
    this.sprite.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: 1.6,
      duration: 180,
      onComplete: () => this.sprite.destroy(),
    });
    return true;
  }

  destroy(): void {
    this.alive = false;
    this.removeBar();
    this.sprite.destroy();
  }

  private placeBar(): void {
    if (!this.barBack || !this.barFill) return;
    const y = this.sprite.y - this.radius - 14;
    this.barBack.setPosition(this.sprite.x, y);
    this.barFill.setPosition(this.sprite.x - BAR_WIDTH / 2, y).setOrigin(0, 0.5);
    this.barBack.setOrigin(0.5, 0.5);
    this.updateBar();
  }

  private updateBar(): void {
    if (!this.barFill) return;
    const ratio = Math.max(0, Math.min(1, this.remainingHp / this.maxHp));
    this.barFill.width = BAR_WIDTH * ratio;
  }

  private removeBar(): void {
    this.barBack?.destroy();
    this.barFill?.destroy();
  }
}
