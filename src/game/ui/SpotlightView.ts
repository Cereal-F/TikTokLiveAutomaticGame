import type Phaser from "phaser";
import { WORLD } from "../core/constants.js";
import type { Spotlight } from "../core/spotlight.js";

/** Cor do destaque por nível do presente (0 = curtidas). */
const TIER_COLORS: Record<number, number> = {
  0: 0x4ade80,
  1: 0xb36bff,
  2: 0x67e8f9,
  3: 0xff9f43,
  4: 0xff5e7e,
};

const PANEL = { width: 640, height: 200, top: 470 } as const;
const AVATAR = { radius: 64, offsetX: -240 } as const;
const DEPTH = 150;

/** Objeto visual que some e aparece, como textos e retângulos. */
interface Toggleable {
  setVisible(value: boolean): unknown;
  setAlpha(value: number): unknown;
}

/** Chave de textura estável para uma URL de foto. */
function avatarKey(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) hash = (hash * 31 + url.charCodeAt(i)) | 0;
  return `avatar:${hash >>> 0}`;
}

function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toUpperCase() : "?";
}

/**
 * Aviso no meio da tela: foto de quem enviou ou curtiu, o @, o que enviou e o efeito recebido.
 * A foto carrega em segundo plano; enquanto isso, ou se falhar, aparece a inicial do nome.
 */
export class SpotlightView {
  private readonly parts: Toggleable[] = [];
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly avatarBack: Phaser.GameObjects.Arc;
  private readonly initialText: Phaser.GameObjects.Text;
  private readonly avatarImage: Phaser.GameObjects.Image;
  private readonly handleText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly effectText: Phaser.GameObjects.Text;
  private currentUrl: string | null = null;
  private readonly requested = new Set<string>();
  private readonly onLoaded = (): void => this.applyLoadedAvatar();

  constructor(private readonly scene: Phaser.Scene) {
    const cx = WORLD.width / 2;
    const cy = PANEL.top + PANEL.height / 2;
    const avatarX = cx + AVATAR.offsetX;

    this.background = scene.add.rectangle(cx, cy, PANEL.width, PANEL.height, 0x000000, 0.72).setDepth(DEPTH);
    this.avatarBack = scene.add.circle(avatarX, cy, AVATAR.radius, 0x1b2340).setDepth(DEPTH + 1);
    this.initialText = scene.add
      .text(avatarX, cy, "", { fontFamily: "monospace", fontSize: "56px", color: "#0b0b12", stroke: "#ffffff", strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(DEPTH + 2);
    // A foto fica invisível até carregar: nunca aparece a textura padrão do Phaser.
    this.avatarImage = scene.add.image(avatarX, cy, "__DEFAULT").setVisible(false).setDepth(DEPTH + 2);
    const mask = scene.make.graphics({ x: 0, y: 0 }, false).fillStyle(0xffffff).fillCircle(avatarX, cy, AVATAR.radius);
    this.avatarImage.setMask(mask.createGeometryMask());

    const textX = avatarX + AVATAR.radius + 28;
    const label = { fontFamily: "monospace", stroke: "#000000", strokeThickness: 4 } as const;
    this.handleText = scene.add.text(textX, cy - 56, "", { ...label, fontSize: "32px", color: "#ffd23f" }).setOrigin(0, 0.5).setDepth(DEPTH + 2);
    this.titleText = scene.add.text(textX, cy - 4, "", { ...label, fontSize: "28px", color: "#e8ecff" }).setOrigin(0, 0.5).setDepth(DEPTH + 2);
    this.effectText = scene.add.text(textX, cy + 48, "", { ...label, fontSize: "24px", color: "#b36bff" }).setOrigin(0, 0.5).setDepth(DEPTH + 2);

    this.parts.push(this.background, this.avatarBack, this.initialText, this.handleText, this.titleText, this.effectText);
    this.hide();
    scene.load.on("complete", this.onLoaded);
  }

  /** Remove o ouvinte do carregador ao encerrar a cena. */
  destroy(): void {
    this.scene.load.off("complete", this.onLoaded);
  }

  show(item: Spotlight): void {
    const color = TIER_COLORS[item.tier] ?? TIER_COLORS[0]!;
    this.background.setStrokeStyle(4, color);
    this.avatarBack.setFillStyle(color);
    this.initialText.setText(initialOf(item.userName || item.userId));
    this.handleText.setText(`@${item.userId}`);
    this.titleText.setText(item.title);
    this.effectText.setText(item.effect);

    this.currentUrl = item.avatarUrl ?? null;
    this.avatarImage.setVisible(false);
    this.parts.forEach((part) => {
      part.setVisible(true);
      part.setAlpha(0);
    });
    this.effectText.setVisible(item.effect.length > 0);
    this.scene.tweens.killTweensOf(this.parts);
    this.scene.tweens.add({ targets: this.parts, alpha: 1, duration: 180 });

    // Depois de mostrar a inicial, troca pela foto se ela já estiver carregada (ou quando carregar).
    if (this.currentUrl) this.requestAvatar(this.currentUrl);
    this.applyLoadedAvatar();
  }

  hide(): void {
    this.parts.forEach((part) => part.setVisible(false));
    this.avatarImage.setVisible(false);
  }

  private requestAvatar(url: string): void {
    const key = avatarKey(url);
    if (this.scene.textures.exists(key) || this.requested.has(key)) return;
    this.requested.add(key);
    try {
      this.scene.load.setCORS("anonymous");
      this.scene.load.image(key, url);
      this.scene.load.start();
    } catch {
      // Sem foto, o aviso continua com a inicial do nome.
    }
  }

  private applyLoadedAvatar(): void {
    if (!this.currentUrl) return;
    const key = avatarKey(this.currentUrl);
    if (!this.scene.textures.exists(key)) return;
    this.avatarImage.setTexture(key).setDisplaySize(AVATAR.radius * 2, AVATAR.radius * 2).setVisible(true);
    this.initialText.setVisible(false);
  }
}
