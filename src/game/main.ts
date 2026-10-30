import Phaser from "phaser";
import { WORLD } from "./core/constants.js";
import { ArenaScene } from "./scenes/ArenaScene.js";
import { BootScene } from "./scenes/BootScene.js";
import { GameOverScene } from "./scenes/GameOverScene.js";

/**
 * Ponto de entrada do jogo. O canvas usa resolução vertical (720x1280) e escala
 * para caber na janela, inclusive na fonte de navegador do OBS.
 */
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: "#0d0f1a",
  pixelArt: true,
  // Sem arredondar a posição em pixels: com ele o personagem trepida ao se deslocar devagar.
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, ArenaScene, GameOverScene],
});
