import Phaser from "phaser";
import { WORLD } from "../core/constants.js";
import type { SessionStats } from "../core/GameSession.js";
import { createMenuButton } from "../ui/menuButton.js";
import { formatTime } from "../core/format.js";
import { SCENE_KEYS } from "./keys.js";

const EMPTY_STATS: SessionStats = { wave: 1, score: 0, kills: 0, survivedMs: 0 };

/** Tela de derrota com o resumo da partida e a opção de jogar de novo. */
export class GameOverScene extends Phaser.Scene {
  private stats: SessionStats = EMPTY_STATS;

  constructor() {
    super(SCENE_KEYS.gameOver);
  }

  init(data: SessionStats | undefined): void {
    this.stats = data ?? EMPTY_STATS;
  }

  create(): void {
    const cx = WORLD.width / 2;
    const stats = this.stats;

    this.add
      .text(cx, 300, "FIM DE JOGO", {
        fontFamily: "monospace",
        fontSize: "72px",
        color: "#f87171",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    const lines = [
      `Onda alcançada: ${stats.wave}`,
      `Pontos: ${stats.score}`,
      `Inimigos derrotados: ${stats.kills}`,
      `Tempo sobrevivido: ${formatTime(stats.survivedMs)}`,
    ];
    this.add
      .text(cx, 520, lines.join("\n"), {
        fontFamily: "monospace",
        fontSize: "34px",
        color: "#e8ecff",
        align: "center",
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    createMenuButton(this, cx, 860, "JOGAR NOVAMENTE", () => this.restart());
    this.input.keyboard?.once("keydown-ENTER", () => this.restart());
  }

  private restart(): void {
    this.scene.start(SCENE_KEYS.arena);
  }
}
