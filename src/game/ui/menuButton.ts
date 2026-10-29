import type Phaser from "phaser";

/** Botão simples em pixel art: retângulo com texto, reage ao mouse e ao toque. */
export function createMenuButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const width = 360;
  const height = 72;
  const background = scene.add.rectangle(0, 0, width, height, 0x232945).setStrokeStyle(4, 0xffd23f);
  const text = scene.add
    .text(0, 0, label, { fontFamily: "monospace", fontSize: "30px", color: "#ffffff" })
    .setOrigin(0.5);

  const container = scene.add.container(x, y, [background, text]);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });
  container.on("pointerover", () => background.setFillStyle(0x34406b));
  container.on("pointerout", () => background.setFillStyle(0x232945));
  container.on("pointerdown", onClick);
  return container;
}
