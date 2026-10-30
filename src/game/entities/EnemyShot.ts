import type Phaser from "phaser";
import { SHOT } from "../core/constants.js";
import type { Point } from "../core/targeting.js";

/** Tiro disparado por um atirador ou chefe. Acerta o personagem por contato e causa dano. */
export class EnemyShot {
  readonly sprite: Phaser.GameObjects.Image;
  readonly damage: number;
  private readonly vx: number;
  private readonly vy: number;
  private travelled = 0;

  constructor(scene: Phaser.Scene, origin: Point, direction: Point, speed: number, damage: number) {
    this.damage = damage;
    this.vx = direction.x * speed;
    this.vy = direction.y * speed;
    this.sprite = scene.add.image(origin.x, origin.y, "shot").setDepth(9);
  }

  get position(): Point {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** Avança o tiro. Retorna false quando ele deve ser removido (alcance máximo atingido). */
  advance(dtMs: number): boolean {
    const seconds = dtMs / 1000;
    const dx = this.vx * seconds;
    const dy = this.vy * seconds;
    this.sprite.setPosition(this.sprite.x + dx, this.sprite.y + dy);
    this.travelled += Math.hypot(dx, dy);
    return this.travelled < SHOT.maxTravel;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
