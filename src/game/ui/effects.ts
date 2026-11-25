import type Phaser from "phaser";
import { WORLD } from "../core/constants.js";

/** Efeitos visuais curtos (explosões, ondas, flashes e confete). Criados e destruídos sozinhos. */

const DEPTH = 9;
const CONFETTI_COLORS = [0xffd23f, 0xb36bff, 0x67e8f9, 0xff9f43, 0x4ade80, 0xff5e7e] as const;

export interface BurstOptions {
  color: number;
  /** Quantidade de pedaços. */
  count: number;
  /** Distância máxima que um pedaço voa, em pixels. */
  speed: number;
  /** Tamanho base de cada pedaço. */
  size: number;
  /** Tempo de vida de um pedaço, em milissegundos. */
  lifeMs: number;
}

/** Explosão de pedaços que voam em todas as direções, giram e somem. */
export function burst(scene: Phaser.Scene, x: number, y: number, options: BurstOptions): void {
  for (let i = 0; i < options.count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = options.speed * (0.45 + Math.random() * 0.55);
    const size = options.size * (0.6 + Math.random() * 0.8);
    const piece = scene.add.rectangle(x, y, size, size, options.color).setDepth(DEPTH);
    scene.tweens.add({
      targets: piece,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      angle: Math.random() * 360,
      alpha: 0,
      scale: 0.2,
      duration: options.lifeMs * (0.6 + Math.random() * 0.4),
      ease: "Cubic.easeOut",
      onComplete: () => piece.destroy(),
    });
  }
}

/** Anel que cresce a partir do centro e desaparece. */
export function shockwave(
  scene: Phaser.Scene,
  x: number,
  y: number,
  maxRadius: number,
  color: number,
  durationMs: number,
  width = 4,
): void {
  const ring = { radius: 4, alpha: 1 };
  const graphics = scene.add.graphics().setDepth(DEPTH);
  scene.tweens.add({
    targets: ring,
    radius: maxRadius,
    alpha: 0,
    duration: durationMs,
    ease: "Cubic.easeOut",
    onUpdate: () => {
      graphics.clear().lineStyle(width, color, ring.alpha).strokeCircle(x, y, ring.radius);
    },
    onComplete: () => graphics.destroy(),
  });
}

/** Clarão que cobre a tela inteira e some. */
export function flash(scene: Phaser.Scene, color: number, alpha: number, durationMs: number): void {
  const screen = scene.add.rectangle(0, 0, WORLD.width, WORLD.height, color, alpha).setOrigin(0).setDepth(DEPTH + 20);
  scene.tweens.add({ targets: screen, alpha: 0, duration: durationMs, onComplete: () => screen.destroy() });
}

/** Confete caindo pela tela inteira, em cores de festa. */
export function confetti(scene: Phaser.Scene, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
    const size = 6 + Math.random() * 6;
    const piece = scene.add
      .rectangle(Math.random() * WORLD.width, -20, size, size * 0.5, color)
      .setDepth(DEPTH + 30);
    scene.tweens.add({
      targets: piece,
      y: WORLD.height + 40,
      x: piece.x + (Math.random() - 0.5) * 160,
      angle: 720 * (Math.random() > 0.5 ? 1 : -1),
      duration: 2_200 + Math.random() * 1_200,
      delay: Math.random() * 900,
      ease: "Sine.easeIn",
      onComplete: () => piece.destroy(),
    });
  }
}
