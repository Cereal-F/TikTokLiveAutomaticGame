import type Phaser from "phaser";
import { WORLD } from "../core/constants.js";
import type { Spotlight } from "../core/spotlight.js";
import { AvatarView } from "./avatars.js";

/** Cor de cada nível do presente (0 = curtidas). */
const TIER_COLORS: Record<number, number> = {
  0: 0x4ade80,
  1: 0xb36bff,
  2: 0x67e8f9,
  3: 0xff9f43,
  4: 0xff5e7e,
};

const TIER_TEXT: Record<number, string> = {
  0: "#4ade80",
  1: "#b36bff",
  2: "#67e8f9",
  3: "#ff9f43",
  4: "#ff5e7e",
};

const DEPTH = 150;
const FADE_MS = 220;

/** Geometria de um aviso: grande no centro, ou compacto no lado direito. */
interface Layout {
  prominent: boolean;
  cx: number;
  cy: number;
  width: number;
  height: number;
  radius: number;
  avatarRadius: number;
  avatarX: number;
  textX: number;
}

function layoutFor(prominent: boolean): Layout {
  if (prominent) {
    const width = 620;
    const height = 168;
    const cx = WORLD.width / 2;
    const cy = 560;
    const avatarRadius = 50;
    const avatarX = cx - width / 2 + 24 + avatarRadius;
    return { prominent, cx, cy, width, height, radius: 26, avatarRadius, avatarX, textX: avatarX + avatarRadius + 28 };
  }
  const width = 420;
  const height = 72;
  const cx = WORLD.width - 24 - width / 2;
  const cy = 740;
  const avatarRadius = 22;
  const avatarX = cx - width / 2 + 14 + avatarRadius;
  return { prominent, cx, cy, width, height, radius: 16, avatarRadius, avatarX, textX: avatarX + avatarRadius + 14 };
}

/** Corta o texto para caber na largura do aviso, com reticências. */
function clip(text: string, maxChars: number): string {
  const chars = [...text];
  return chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join("")}…` : text;
}

/**
 * Aviso de quem enviou um presente ou curtiu. Presentes de valor alto aparecem grandes no centro;
 * curtidas e presentes pequenos, numa faixa compacta do lado direito, para não tirar a atenção do jogo.
 * A foto carrega em segundo plano; enquanto isso, ou se falhar, aparece a inicial do nome.
 */
export class SpotlightView {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly avatar: AvatarView;
  private readonly handleText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly effectText: Phaser.GameObjects.Text;
  private effectWanted = false;
  private readonly fade = { value: 0 };
  private readonly onLoaded = (): void => this.avatar.refresh();

  constructor(private readonly scene: Phaser.Scene) {
    const label = { fontFamily: "monospace", stroke: "#000000", strokeThickness: 4 } as const;
    this.panel = scene.add.graphics().setDepth(DEPTH);
    this.avatar = new AvatarView(scene, DEPTH + 1);
    this.handleText = scene.add.text(0, 0, "", label).setOrigin(0, 0.5).setDepth(DEPTH + 2);
    this.titleText = scene.add.text(0, 0, "", label).setOrigin(0, 0.5).setDepth(DEPTH + 2);
    this.effectText = scene.add.text(0, 0, "", label).setOrigin(0, 0.5).setDepth(DEPTH + 2);
    this.hide();
    scene.load.on("complete", this.onLoaded);
  }

  /** Remove o ouvinte do carregador e a animação ao encerrar a cena. */
  destroy(): void {
    this.scene.load.off("complete", this.onLoaded);
    this.scene.tweens.killTweensOf(this.fade);
  }

  show(item: Spotlight): void {
    const layout = layoutFor(item.prominent);
    const color = TIER_COLORS[item.tier] ?? TIER_COLORS[0]!;
    const textColor = TIER_TEXT[item.tier] ?? TIER_TEXT[0]!;

    this.drawPanel(layout, color);
    this.avatar.place(layout.avatarX, layout.cy, layout.avatarRadius, item.userName || item.userId, color, item.avatarUrl);
    this.placeTexts(layout, item, textColor);
    this.setVisible(true);
    this.fadeIn();
  }

  hide(): void {
    this.scene.tweens.killTweensOf(this.fade);
    this.setVisible(false);
  }

  private drawPanel(layout: Layout, color: number): void {
    const left = layout.cx - layout.width / 2;
    const top = layout.cy - layout.height / 2;
    this.panel
      .clear()
      .fillStyle(0x0a0c18, layout.prominent ? 0.92 : 0.8)
      .fillRoundedRect(left, top, layout.width, layout.height, layout.radius)
      .lineStyle(layout.prominent ? 3 : 2, color, 1)
      .strokeRoundedRect(left, top, layout.width, layout.height, layout.radius);
  }

  private placeTexts(layout: Layout, item: Spotlight, textColor: string): void {
    const { textX, cy } = layout;
    if (layout.prominent) {
      this.handleText.setText(clip(`@${item.userId}`, 27)).setFontSize(30).setColor(textColor).setPosition(textX, cy - 52);
      this.titleText.setText(clip(item.title, 28)).setFontSize(28).setColor("#e8ecff").setPosition(textX, cy - 4);
      this.effectWanted = item.effect.length > 0;
      this.effectText.setText(clip(item.effect, 37)).setFontSize(22).setColor(textColor).setPosition(textX, cy + 44);
      return;
    }
    // Compacto: o @ numa linha, o que enviou e o efeito na outra.
    this.handleText.setText(clip(`@${item.userId}`, 29)).setFontSize(20).setColor(textColor).setPosition(textX, cy - 14);
    const detail = [item.title, item.effect].filter((part) => part.length > 0).join(" · ");
    this.titleText.setText(clip(detail, 34)).setFontSize(17).setColor("#e8ecff").setPosition(textX, cy + 14);
    this.effectWanted = false;
    this.effectText.setText("");
  }

  private setVisible(value: boolean): void {
    this.panel.setVisible(value);
    this.avatar.setVisible(value);
    this.handleText.setVisible(value);
    this.titleText.setVisible(value);
    this.effectText.setVisible(value && this.effectWanted);
  }

  private setAlpha(value: number): void {
    this.panel.setAlpha(value);
    this.avatar.setAlpha(value);
    this.handleText.setAlpha(value);
    this.titleText.setAlpha(value);
    this.effectText.setAlpha(value);
  }

  private fadeIn(): void {
    this.scene.tweens.killTweensOf(this.fade);
    this.fade.value = 0;
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this.fade,
      value: 1,
      duration: FADE_MS,
      ease: "Quad.easeOut",
      onUpdate: () => this.setAlpha(this.fade.value),
    });
  }
}
