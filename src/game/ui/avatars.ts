import type Phaser from "phaser";

/** Fotos já pedidas em cada cena, para a mesma URL não ser baixada duas vezes. */
const requestedByScene = new WeakMap<Phaser.Scene, Set<string>>();

/** Chave de textura estável para uma URL de foto. */
export function avatarKey(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) hash = (hash * 31 + url.charCodeAt(i)) | 0;
  return `avatar:${hash >>> 0}`;
}

/** Primeira letra do nome, em maiúscula; "?" se o nome estiver vazio. */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toUpperCase() : "?";
}

/**
 * Pede a foto à fila de carregamento da cena e devolve a chave da textura.
 * A textura só existe quando a foto carrega; se falhar, quem mostra usa a inicial do nome.
 */
export function requestAvatar(scene: Phaser.Scene, url: string): string {
  const key = avatarKey(url);
  if (scene.textures.exists(key)) return key;
  let requested = requestedByScene.get(scene);
  if (!requested) {
    requested = new Set<string>();
    requestedByScene.set(scene, requested);
  }
  if (requested.has(key)) return key;
  requested.add(key);
  try {
    scene.load.setCORS("anonymous");
    scene.load.image(key, url);
    if (!scene.load.isLoading()) scene.load.start();
  } catch {
    // Sem foto: a inicial do nome continua visível.
  }
  return key;
}

/**
 * Avatar circular: a foto quando ela estiver carregada; enquanto isso (ou se falhar),
 * a inicial do nome sobre a cor do nível.
 */
export class AvatarView {
  private readonly back: Phaser.GameObjects.Arc;
  private readonly initial: Phaser.GameObjects.Text;
  private readonly image: Phaser.GameObjects.Image;
  private readonly mask: Phaser.GameObjects.Graphics;
  private key: string | null = null;
  private radius = 0;
  private shown = true;
  private alphaValue = 1;

  constructor(private readonly scene: Phaser.Scene, depth: number) {
    this.back = scene.add.circle(0, 0, 1, 0x1b2340).setDepth(depth).setVisible(false);
    this.initial = scene.add
      .text(0, 0, "", { fontFamily: "monospace", color: "#0b0b12", stroke: "#ffffff", strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(depth + 1)
      .setVisible(false);
    // A foto fica invisível até carregar: nunca aparece a textura padrão do Phaser.
    this.image = scene.add.image(0, 0, "__DEFAULT").setDepth(depth + 1).setVisible(false);
    this.mask = scene.make.graphics({ x: 0, y: 0 }, false);
    this.image.setMask(this.mask.createGeometryMask());
  }

  /** Posiciona o avatar e pede a foto, se houver URL. */
  place(x: number, y: number, radius: number, name: string, color: number, url?: string): void {
    this.radius = radius;
    this.key = url ? requestAvatar(this.scene, url) : null;
    this.back.setPosition(x, y).setRadius(radius).setFillStyle(color);
    this.initial.setPosition(x, y).setText(initialOf(name)).setFontSize(Math.round(radius * 1.1));
    this.image.setPosition(x, y);
    this.mask.clear().fillStyle(0xffffff, 1).fillCircle(x, y, radius);
    this.refresh();
  }

  /** Troca a inicial pela foto assim que ela estiver carregada. */
  refresh(): void {
    const ready = this.key !== null && this.scene.textures.exists(this.key);
    if (ready && this.key !== null && this.image.texture.key !== this.key) {
      this.image.setTexture(this.key);
    }
    if (ready) this.image.setDisplaySize(this.radius * 2, this.radius * 2);
    this.back.setVisible(this.shown).setAlpha(this.alphaValue);
    this.image.setVisible(this.shown && ready).setAlpha(this.alphaValue);
    this.initial.setVisible(this.shown && !ready).setAlpha(this.alphaValue);
  }

  setVisible(value: boolean): void {
    this.shown = value;
    this.refresh();
  }

  setAlpha(value: number): void {
    this.alphaValue = value;
    this.refresh();
  }
}
