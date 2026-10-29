import Phaser from "phaser";

/**
 * Sprites em pixel art gerados por código, para não depender de arquivos de imagem.
 * Cada caractere de uma linha é um pixel; '.' é transparente.
 */
const PALETTE: Record<string, number> = {
  k: 0x0b0b12,
  w: 0xffffff,
  b: 0x3a7bff,
  y: 0xffd23f,
  r: 0xe8413c,
  g: 0x4ade80,
  p: 0xb36bff,
  B: 0x1e3a8a,
  c: 0x67e8f9,
  s: 0xcbd5e1,
};

/** Defensor azul: elmo com viseira, tabardo branco com cinto dourado e escudo ciano na lateral. */
const HERO_ROWS = [
  "....kkkk....",
  "...kbbbbk...",
  "..kbbbbbbk..",
  ".kbbcccbbbk.",
  ".kbbbbbbbbk.",
  "kkBBBBBBBBkk",
  "kBbbwwwwbbBk",
  "kBbbwyywbbBk",
  "kcBbwwwwbbBk",
  "ksBBbbbbBBsk",
  ".kkk....kkk.",
  "..kk....kk..",
];

/** Chefe: corpo vermelho com chifres, olhos amarelos e dentes. */
const BOSS_ROWS = [
  "w..kkkkkkkk..w",
  "ww.krrrrrrk.ww",
  ".wkrrrrrrrrkw.",
  ".kkrryrryyrkk.",
  "kkrrrrrrrrrrkk",
  "krrrwwrrwwrrrk",
  "krrrrrrrrrrrrk",
  "krkrkrkrkrkrrk",
  "krrrrprrprrrrk",
  ".krrrrrrrrrrk.",
  "..kk.kkkk.kk..",
  ".k..k....k..k.",
];

const MONSTER_ROWS = [
  "..kkkkkk..",
  ".krrrrrrk.",
  "krrrrrrrrk",
  "krwkrrkwrk",
  "krrrrrrrrk",
  "krrrkkrrrk",
  "krrrrrrrrk",
  ".krrrrrrk.",
  "..k.kk.k..",
  ".k......k.",
];

const PROJECTILE_ROWS = [".yy.", "yyyy", "yyyy", ".yy."];

function drawPixelSprite(
  scene: Phaser.Scene,
  key: string,
  rows: readonly string[],
  scale: number,
): void {
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  const width = Math.max(...rows.map((row) => row.length));
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const color = PALETTE[char];
      if (color === undefined) return;
      graphics.fillStyle(color, 1);
      graphics.fillRect(x * scale, y * scale, scale, scale);
    });
  });
  graphics.generateTexture(key, width * scale, rows.length * scale);
  graphics.destroy();
}

function drawFloorTile(scene: Phaser.Scene, key: string): void {
  const size = 32;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0x151a2b, 1);
  graphics.fillRect(0, 0, size, size);
  graphics.fillStyle(0x1d2440, 1);
  graphics.fillRect(0, 0, size, 2);
  graphics.fillRect(0, 0, 2, size);
  graphics.fillStyle(0x10142a, 1);
  graphics.fillRect(8, 8, 4, 4);
  graphics.fillRect(20, 22, 4, 4);
  graphics.generateTexture(key, size, size);
  graphics.destroy();
}

/** Gera todas as texturas usadas pelo jogo. Chamada uma vez, na cena de carregamento. */
export function createPixelTextures(scene: Phaser.Scene): void {
  const pixel = 4;
  if (!scene.textures.exists("hero")) drawPixelSprite(scene, "hero", HERO_ROWS, pixel);
  if (!scene.textures.exists("monster")) drawPixelSprite(scene, "monster", MONSTER_ROWS, pixel);
  if (!scene.textures.exists("boss")) drawPixelSprite(scene, "boss", BOSS_ROWS, pixel);
  if (!scene.textures.exists("projectile")) drawPixelSprite(scene, "projectile", PROJECTILE_ROWS, 2);
  if (!scene.textures.exists("floor")) drawFloorTile(scene, "floor");
}
