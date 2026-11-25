import type Phaser from "phaser";
import { WORLD } from "../core/constants.js";
import type { Chapter } from "../core/scenery.js";

const DEPTH = 180;
/** Duração de cada etapa da troca de capítulo, em milissegundos de jogo. */
const TIMING = { veilInMs: 450, cardInMs: 400, holdMs: 1_500, cardOutMs: 300, veilOutMs: 600 } as const;

function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Troca de capítulo: a tela escurece, o cenário muda no escuro e o nome do novo capítulo aparece.
 * Depois a tela clareia e a partida volta, com os inimigos novos.
 */
export class ChapterTransition {
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly card: Phaser.GameObjects.Text[];
  private readonly kicker: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;
    const label = { fontFamily: "monospace", stroke: "#000000", strokeThickness: 6 } as const;
    this.veil = scene.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x05060c, 1).setOrigin(0).setDepth(DEPTH).setAlpha(0);
    this.kicker = scene.add
      .text(cx, cy - 130, "", { ...label, fontSize: "30px", color: "#e8ecff" })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1)
      .setAlpha(0);
    this.title = scene.add
      .text(cx, cy - 40, "", { ...label, fontSize: "60px", color: "#ffffff" })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1)
      .setAlpha(0);
    this.subtitle = scene.add
      .text(cx, cy + 50, "", { ...label, fontSize: "28px", color: "#e8ecff", strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1)
      .setAlpha(0);
    this.card = [this.kicker, this.title, this.subtitle];
  }

  /**
   * Executa a troca: escurece, chama `swap` no escuro (o cenário muda ali), mostra o nome do capítulo
   * e chama `done` quando a tela já estiver clara de novo.
   */
  play(chapter: Chapter, swap: () => void, done: () => void): void {
    this.kicker.setText(`CAPÍTULO ${chapter.index + 1}`);
    this.title.setText(chapter.name).setColor(hexColor(chapter.color));
    this.subtitle.setText(`Novos inimigos: ${chapter.enemies}`);

    this.scene.tweens.add({
      targets: this.veil,
      alpha: 0.92,
      duration: TIMING.veilInMs,
      ease: "Quad.easeIn",
      onComplete: () => {
        swap();
        this.scene.cameras.main.shake(260, 0.005);
        this.scene.tweens.add({ targets: this.card, alpha: 1, duration: TIMING.cardInMs, ease: "Quad.easeOut" });
        this.scene.time.delayedCall(TIMING.holdMs, () => this.reveal(done));
      },
    });
  }

  private reveal(done: () => void): void {
    this.scene.tweens.add({ targets: this.card, alpha: 0, duration: TIMING.cardOutMs });
    this.scene.tweens.add({
      targets: this.veil,
      alpha: 0,
      duration: TIMING.veilOutMs,
      ease: "Quad.easeOut",
      onComplete: done,
    });
  }
}
