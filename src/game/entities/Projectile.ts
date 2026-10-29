import type Phaser from "phaser";
import { PROJECTILE } from "../core/constants.js";
import type { Point } from "../core/targeting.js";

/** Projétil disparado automaticamente em direção ao inimigo mais próximo. */
export class Projectile {
  readonly sprite: Phaser.GameObjects.Image;
  readonly damage: number;
  private readonly vx: number;
  private readonly vy: number;
  private travelled = 0;

  constructor(scene: Phaser.Scene, origin: Point, direction: Point, damage: number) {
    this.damage = damage;
    this.vx = direction.x * PROJECTILE.speed;
    this.vy = direction.y * PROJECTILE.speed;
    this.sprite = scene.add.image(origin.x, origin.y, "projectile").setDepth(8);
  }

  get position(): Point {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** Avança o projétil. Retorna false quando ele deve ser removido (alcance máximo atingido). */
  advance(dtMs: number): boolean {
    const seconds = dtMs / 1000;
    const dx = this.vx * seconds;
    const dy = this.vy * seconds;
    this.sprite.setPosition(this.sprite.x + dx, this.sprite.y + dy);
    this.travelled += Math.hypot(dx, dy);
    return this.travelled < PROJECTILE.maxTravel;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
