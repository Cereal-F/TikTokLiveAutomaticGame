import Phaser from "phaser";
import { WORLD } from "../core/constants.js";
import { createMenuButton } from "../ui/menuButton.js";
import { SCENE_KEYS } from "./keys.js";

/** Tela inicial com o botão para começar a partida. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.menu);
  }

  create(): void {
    const cx = WORLD.width / 2;
    this.add
      .text(cx, 320, "LIVE\nSURVIVORS", {
        fontFamily: "monospace",
        fontSize: "84px",
        color: "#ffd23f",
        align: "center",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 560, "Sobreviva às ondas.\nA audiência pode ajudar (ou atrapalhar).", {
        fontFamily: "monospace",
        fontSize: "26px",
        color: "#e8ecff",
        align: "center",
      })
      .setOrigin(0.5);

    createMenuButton(this, cx, 800, "COMEÇAR", () => this.startArena());

    this.add
      .text(cx, 1010, "WASD ou setas para mover\nAtaque automático", {
        fontFamily: "monospace",
        fontSize: "22px",
        color: "#8a93b8",
        align: "center",
      })
      .setOrigin(0.5);

    this.input.keyboard?.once("keydown-ENTER", () => this.startArena());
  }

  private startArena(): void {
    this.scene.start(SCENE_KEYS.arena);
  }
}
