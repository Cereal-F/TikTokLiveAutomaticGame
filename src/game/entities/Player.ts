import Phaser from "phaser";
import { PLAYER, WORLD } from "../core/constants.js";
import { approachVelocity } from "../core/motion.js";
import type { Point } from "../core/targeting.js";

export interface MoveInput {
  x: number;
  y: number;
}

/** Personagem controlado pelo jogador. Movimento suave e limites; o ataque fica na cena. */
export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  private velocity: Point = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.image(x, y, "hero").setDepth(10);
  }

  get position(): Point {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /**
   * Move na direção indicada (vetor unitário ou zero). A velocidade se aproxima da desejada
   * aos poucos, então mudanças de direção viram curvas suaves. `speedMultiplier` aumenta a
   * velocidade máxima (usado na arrancada).
   */
  move(input: MoveInput, dtMs: number, speedMultiplier = 1): void {
    const maxSpeed = PLAYER.speed * speedMultiplier;
    this.velocity = approachVelocity(this.velocity, input, maxSpeed, PLAYER.acceleration, dtMs);
    const seconds = dtMs / 1000;
    const margin = PLAYER.radius;
    const x = Phaser.Math.Clamp(this.sprite.x + this.velocity.x * seconds, margin, WORLD.width - margin);
    const y = Phaser.Math.Clamp(this.sprite.y + this.velocity.y * seconds, margin, WORLD.height - margin);
    this.sprite.setPosition(x, y);
  }

  flash(): void {
    this.sprite.setTint(0xff5555);
    this.sprite.scene.time.delayedCall(120, () => this.sprite.clearTint());
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
