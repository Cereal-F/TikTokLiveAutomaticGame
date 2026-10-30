import Phaser from "phaser";

/**
 * Sprites em pixel art gerados por código, para não depender de arquivos de imagem.
 * Cada caractere de uma linha é um pixel; '.' é transparente. Linhas de largura menor
 * são centralizadas automaticamente.
 */
const PALETTE: Record<string, number> = {
  k: 0x0b0b12,
  w: 0xffffff,
  b: 0x3a7bff,
  y: 0xffd23f,
  Y: 0xc08a1a,
  r: 0xe8413c,
  R: 0x8b1e1e,
  g: 0x4ade80,
  d: 0x166534,
  p: 0xb36bff,
  q: 0x5b2a8a,
  v: 0x8b5cf6,
  V: 0x4c1d95,
  o: 0xff9a3c,
  O: 0xb3541e,
  m: 0xf0abfc,
  M: 0xc026d3,
  B: 0x1e3a8a,
  c: 0x67e8f9,
  C: 0x0e7490,
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

/** Chefe 1 (REI DOS VÍRUS): corpo vermelho com chifres, olhos amarelos e dentes. */
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

/** Chefe 2 (ESPIRAL): orbe ciano com faixas em espiral. */
const BOSS2_ROWS = [
  "....kkkkkk....",
  "..kkCCcCCckk..",
  "..kwccCccCck..",
  ".kccCcccCcCck.",
  ".kcCcCCccccck.",
  ".kcccccccCcck.",
  ".kccCccccccck.",
  ".kcccccCCcCck.",
  ".kcCcCcccCcck.",
  "..kcCccCccck..",
  "..kkcCCcCCkk..",
  "....kkkkkk....",
];

/** Chefe 3 (INVOCADOR): encapuzado violeta, com manto escuro e olhos brancos. */
const BOSS3_ROWS = [
  "....kkkkkkkk....",
  "...kvvvvvvvvk...",
  "..kvvvvvvvvvvk..",
  ".kvvvvvvvvvvvvk.",
  ".kvvwwvvvvwwvvk.",
  "kvvwkkvvvvkkwvvk",
  "kvvwwvvvvvvwwvvk",
  "kvvvvvvvvvvvvvvk",
  "kvvvvVVVVVVvvvvk",
  "kvvvVVVVVVVVvvvk",
  ".kvvVVVVVVVVvvk.",
  ".kVVVVVVVVVVVVk.",
  "kVVVVVVVVVVVVVVk",
  "kkk.kkk..kkk.kkk",
];

/** Chefe final (REI COROADO): grande, vermelho, com coroa dourada de três pontas e cintilações. */
const BOSS_FINAL_ROWS = [
  "...........yy...........",
  ".....yy....yy....yy.....",
  ".....yy...yyyy...yy.....",
  "....yyyy..yyyy..yyyy....",
  "....yyyy.yyyyyy.yyyy....",
  "...yyyyyyyyyyyyyyyyyy...",
  "..yyyyyyyyyyyyyyyyyyyy..",
  "..YYYYYYYYYYYYYYYYYYYY..",
  ".........krrrrk.........",
  "......kkkrrrrrrkkk......",
  ".....krrrrrrrrrrrrk.....",
  "....krrrrrrrrrrrrrrk....",
  "...krrrrrrrrrrrrrrrrk...",
  "...krrrrwwrrrrwwrrrrk...",
  "..krrrrrkwrrrrwkrrrrrk..",
  "..krrrrrrrrrrrrrrrrrrk..",
  "..krrrrrrrrrrrrrrrrrrk..",
  "..krrrrrrrrrrrrrrrrrrk..",
  "..krrrrrrrrrrrrrrrrrrk..",
  "...krrkwkwkwwkwkwkrrk...",
  "...kRRRRRRRRRRRRRRRRk...",
  "....kRRRRRRRRRRRRRRk....",
  ".....kRRRRRRRRRRRRk.....",
  "......kkkRRRRRRkkk......",
  ".........kkkkkk.........",
];

/** Virus (inimigo básico, ondas 1 a 5): bolinha vermelha com olhos. */
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

/** Atirador (ondas 6 a 10): roxo com canhão cinza que dispara à distância. */
const SHOOTER_ROWS = [
  "....kkk....",
  "..kkpppkk..",
  ".kpppppppk.",
  "kpppwkwpppk",
  "kpppwkwpppk",
  "kpppppppppk",
  "kqqqqqqqqqk",
  ".kkqqqqqkk.",
  "...kkqkk...",
  ".....s.....",
];

/** Saltador (ondas 11 a 15): laranja, largo, com chifres e pernas curtas. */
const CHARGER_ROWS = [
  "ww...kkkk...ww",
  "..kkkooookkk..",
  ".kowkooookwok.",
  ".kooooooooook.",
  ".kooooooooook.",
  ".kOOOOOOOOOOk.",
  "..kOkOOOOkOk..",
  "..kk.kkkk.kk..",
  "..kk......kk..",
];

/** Ouriço (ondas 16 a 20): casco verde com espinhos. */
const TANK_ROWS = [
  ".......s......",
  "....kkkgkks...",
  "...kggggggk...",
  "..kggggggggks.",
  ".kggggggggggk.",
  ".kggwkggkwggk.",
  "kggggggggggggk",
  "sgggggggggggk.",
  ".kgggwggwgggk.",
  "..kddddddddk..",
  "...kddddddk...",
  "....kkkkkk....",
];

/** Tiro inimigo: bolinha magenta com brilho. */
const SHOT_ROWS = [".MMM.", "MmmmM", "MmwmM", "MmmmM", ".MMM."];

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
    // Centraliza linhas mais curtas que a maior, para o desenho não ficar torto.
    const offset = Math.floor((width - row.length) / 2);
    [...row].forEach((char, x) => {
      const color = PALETTE[char];
      if (color === undefined) return;
      graphics.fillStyle(color, 1);
      graphics.fillRect((x + offset) * scale, y * scale, scale, scale);
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
  const sprites: Array<[string, readonly string[], number]> = [
    ["hero", HERO_ROWS, pixel],
    ["monster", MONSTER_ROWS, pixel],
    ["shooter", SHOOTER_ROWS, pixel],
    ["charger", CHARGER_ROWS, pixel],
    ["tank", TANK_ROWS, pixel],
    ["boss", BOSS_ROWS, pixel],
    ["boss2", BOSS2_ROWS, pixel],
    ["boss3", BOSS3_ROWS, pixel],
    ["bossFinal", BOSS_FINAL_ROWS, pixel],
    ["shot", SHOT_ROWS, 3],
    ["projectile", PROJECTILE_ROWS, 2],
  ];
  for (const [key, rows, scale] of sprites) {
    if (!scene.textures.exists(key)) drawPixelSprite(scene, key, rows, scale);
  }
  if (!scene.textures.exists("floor")) drawFloorTile(scene, "floor");
}
