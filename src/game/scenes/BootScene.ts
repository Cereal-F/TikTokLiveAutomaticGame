import Phaser from "phaser";
import { createPixelTextures } from "../render/textures.js";
import { SCENE_KEYS } from "./keys.js";

/** Gera as texturas e segue para o menu. Não há arquivos de imagem para carregar. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    createPixelTextures(this);
    this.scene.start(SCENE_KEYS.menu);
  }
}
