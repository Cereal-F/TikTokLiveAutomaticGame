import Phaser from "phaser";
import { PLAYER, WORLD } from "../core/constants.js";
import type { Point } from "../core/targeting.js";

export interface MoveInput {
  x: number;
  y: number;
}

/** Personagem controlado pelo jogador. Movimento e limites; o ataque fica na cena. */
export class Player {
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.image(x, y, "hero").setDepth(10);
  }

  get position(): Point {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** Move na direção indicada (vetor de entrada, já normalizado ou zero) respeitando os limites da arena. */
  move(input: MoveInput, dtMs: number): void {
    const step = (PLAYER.speed * dtMs) / 1000;
    const margin = PLAYER.radius;
    const x = Phaser.Math.Clamp(this.sprite.x + input.x * step, margin, WORLD.width - margin);
    const y = Phaser.Math.Clamp(this.sprite.y + input.y * step, margin, WORLD.height - margin);
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
