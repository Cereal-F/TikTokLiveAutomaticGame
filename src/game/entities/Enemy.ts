import type Phaser from "phaser";
import { directionTo, type Point } from "../core/targeting.js";

/** Inimigo que persegue o jogador. A vida e a velocidade vêm da configuração da onda. */
export class Enemy {
  readonly sprite: Phaser.GameObjects.Image;
  private remainingHp: number;
  private alive = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    hp: number,
    private readonly speed: number,
  ) {
    this.remainingHp = hp;
    this.sprite = scene.add.image(x, y, "monster").setDepth(5);
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

  chase(target: Point, dtMs: number): void {
    if (!this.alive) return;
    const direction = directionTo(this.position, target);
    const step = (this.speed * dtMs) / 1000;
    this.sprite.setPosition(this.sprite.x + direction.x * step, this.sprite.y + direction.y * step);
  }

  /** Aplica dano. Retorna true se o inimigo foi derrotado por este golpe. */
  takeHit(damage: number): boolean {
    if (!this.alive) return false;
    this.remainingHp -= damage;
    if (this.remainingHp > 0) {
      this.sprite.setTint(0xffffff);
      this.sprite.scene.time.delayedCall(80, () => this.alive && this.sprite.clearTint());
      return false;
    }
    this.alive = false;
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
    this.sprite.destroy();
  }
}
