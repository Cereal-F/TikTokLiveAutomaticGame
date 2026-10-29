import type Phaser from "phaser";
import type { ConnectionState } from "../../client/net/ReconnectingSocket.js";
import type { LeaderboardEntry } from "../../shared/protocol.js";
import type { LiveFeedback, SessionPhase } from "../core/GameSession.js";
import { WORLD } from "../core/constants.js";
import { formatTime } from "../core/format.js";

const FONT = "monospace";
const FEEDBACK_LIFETIME_MS = 6_000;
const MAX_FEEDBACK_LINES = 5;
const MAX_GIFT_LINES = 4;
const MAX_TEXT_CHARS = 40;
const LEADER_NAME_CHARS = 14;

interface SessionSnapshot {
  hp: number;
  maxHp: number;
  wave: number;
  score: number;
  survivedMs: number;
  phase: SessionPhase;
  turboRemainingMs: number;
  shieldRemainingMs: number;
}

/** Linha do feed de presentes: quem enviou, o presente e o poder ativado. */
export interface GiftFeedEntry {
  text: string;
  /** 1 (barato) a 4 (mais caro): define a cor da linha. */
  tier: number;
}

const TONE_COLORS: Record<LiveFeedback["tone"], string> = {
  score: "#ffd23f",
  heal: "#4ade80",
  boost: "#b36bff",
  chat: "#7ad7ff",
  power: "#ff9f43",
};

const TIER_COLORS: Record<number, string> = {
  1: "#b36bff",
  2: "#67e8f9",
  3: "#ff9f43",
  4: "#ff5e7e",
};

/** Pilha de linhas de texto: a mais recente fica no topo e as antigas somem com o tempo. */
class TextStack {
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly times: number[] = [];

  constructor(scene: Phaser.Scene, count: number, x: number, bottomY: number, spacing: number, depth: number, origin: { x: number; y: number }, fontSize: number) {
    for (let i = 0; i < count; i += 1) {
      const text = scene.add
        .text(x, bottomY - i * spacing, "", { fontFamily: FONT, fontSize: `${fontSize}px`, color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
        .setOrigin(origin.x, origin.y)
        .setDepth(depth);
      this.texts.push(text);
      this.times.push(0);
    }
  }

  push(text: string, color: string, now: number): void {
    // Desloca as linhas para o índice seguinte; a nova ocupa o índice 0.
    for (let i = this.texts.length - 1; i > 0; i -= 1) {
      const above = this.texts[i - 1]!;
      this.texts[i]!.setText(above.text).setColor(above.style.color).setAlpha(above.alpha);
      this.times[i] = this.times[i - 1]!;
    }
    const top = this.texts[0];
    if (!top) return;
    top.setText(text.slice(0, MAX_TEXT_CHARS)).setColor(color).setAlpha(1);
    this.times[0] = now;
  }

  fade(now: number): void {
    this.texts.forEach((text, index) => {
      if (!text.text) return;
      text.setAlpha(now - (this.times[index] ?? 0) > FEEDBACK_LIFETIME_MS ? 0 : 1);
    });
  }
}

/** Painel da partida: vida, onda, recorde, efeitos ativos, top presentes, feed de presentes e conexão. */
export class Hud {
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly recordText: Phaser.GameObjects.Text;
  private readonly effectsText: Phaser.GameObjects.Text;
  private readonly connectionText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly leaderLines: Phaser.GameObjects.Text[] = [];
  private readonly feedback: TextStack;
  private readonly gifts: TextStack;
  private readonly hpMaxWidth = 260;

  constructor(private readonly scene: Phaser.Scene) {
    const depth = 100;
    const label = { fontFamily: FONT, fontSize: "28px", color: "#e8ecff", stroke: "#000000", strokeThickness: 4 };

    scene.add.rectangle(24, 24, this.hpMaxWidth, 22, 0x2a1a1a).setOrigin(0).setDepth(depth);
    this.hpFill = scene.add.rectangle(24, 24, this.hpMaxWidth, 22, 0x4ade80).setOrigin(0).setDepth(depth + 1);
    this.hpText = scene.add.text(24, 50, "", label).setDepth(depth);

    this.recordText = scene.add.text(24, 86, "", { ...label, color: "#ffd23f" }).setDepth(depth);
    this.effectsText = scene.add.text(24, 120, "", { ...label, fontSize: "24px", color: "#b36bff" }).setDepth(depth);

    this.waveText = scene.add.text(WORLD.width / 2, 24, "", { ...label, fontSize: "34px" }).setOrigin(0.5, 0).setDepth(depth);
    this.timeText = scene.add.text(WORLD.width - 24, 24, "", label).setOrigin(1, 0).setDepth(depth);
    this.scoreText = scene.add.text(WORLD.width - 24, 60, "", { ...label, color: "#ffd23f" }).setOrigin(1, 0).setDepth(depth);

    // Painel do top 3 de presentes, no canto superior direito.
    const panelWidth = 270;
    const panelX = WORLD.width - 24 - panelWidth;
    scene.add.rectangle(panelX, 100, panelWidth, 150, 0x000000, 0.45).setOrigin(0).setDepth(depth - 1);
    scene.add
      .text(WORLD.width - 24, 108, "TOP 3 PRESENTES", { ...label, fontSize: "22px", color: "#ffd23f" })
      .setOrigin(1, 0)
      .setDepth(depth);
    for (let i = 0; i < 3; i += 1) {
      this.leaderLines.push(
        scene.add
          .text(WORLD.width - 24, 146 + i * 36, "", { ...label, fontSize: "22px" })
          .setOrigin(1, 0)
          .setDepth(depth),
      );
    }

    this.connectionText = scene.add
      .text(24, WORLD.height - 24, "", { fontFamily: FONT, fontSize: "18px", color: "#8a93b8" })
      .setOrigin(0, 1)
      .setDepth(depth);

    this.bannerText = scene.add
      .text(WORLD.width / 2, WORLD.height * 0.4, "", { ...label, fontSize: "48px", color: "#ffd23f" })
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setAlpha(0);

    // Feed de presentes acima do feed de chat, ambos na base da tela.
    this.gifts = new TextStack(scene, MAX_GIFT_LINES, 24, WORLD.height - 230, 32, depth, { x: 0, y: 1 }, 20);
    this.feedback = new TextStack(scene, MAX_FEEDBACK_LINES, 24, WORLD.height - 70, 30, depth, { x: 0, y: 1 }, 22);
  }

  update(snapshot: SessionSnapshot): void {
    const ratio = Math.max(0, Math.min(1, snapshot.hp / snapshot.maxHp));
    this.hpFill.width = this.hpMaxWidth * ratio;
    this.hpFill.fillColor = ratio > 0.35 ? 0x4ade80 : 0xf87171;
    this.hpText.setText(`VIDA ${Math.ceil(snapshot.hp)}/${snapshot.maxHp}`);
    this.waveText.setText(`ONDA ${snapshot.wave}`);
    this.timeText.setText(`TEMPO ${formatTime(snapshot.survivedMs)}`);
    this.scoreText.setText(`PONTOS ${snapshot.score}`);
    this.effectsText.setText(effectsLabel(snapshot.turboRemainingMs, snapshot.shieldRemainingMs));
    const now = this.scene.time.now;
    this.feedback.fade(now);
    this.gifts.fade(now);
  }

  /** Mostra o recorde de ondas guardado pelo servidor (null = ainda não carregado). */
  setRecord(bestWave: number | null): void {
    this.recordText.setText(bestWave === null ? "" : `RECORDE: ONDA ${bestWave}`);
  }

  setLeaderboard(entries: LeaderboardEntry[]): void {
    this.leaderLines.forEach((line, index) => {
      const entry = entries[index];
      line.setText(entry ? `${index + 1}. ${entry.userName.slice(0, LEADER_NAME_CHARS)} ${entry.diamonds}` : "");
    });
  }

  setConnection(state: ConnectionState): void {
    const labels: Record<ConnectionState, string> = {
      connecting: "Live: conectando...",
      open: "Live: conectado",
      closed: "Live: sem conexão (o jogo continua)",
    };
    this.connectionText.setText(labels[state]);
  }

  pushFeedback(entries: LiveFeedback[]): void {
    for (const entry of entries) {
      this.feedback.push(entry.text, TONE_COLORS[entry.tone], this.scene.time.now);
    }
  }

  pushGift(entry: GiftFeedEntry): void {
    this.gifts.push(entry.text, TIER_COLORS[entry.tier] ?? "#ffffff", this.scene.time.now);
  }

  showBanner(text: string): void {
    this.bannerText.setText(text).setAlpha(1).setScale(0.8);
    this.scene.tweens.add({ targets: this.bannerText, scale: 1, alpha: 0, duration: 1_800, ease: "Quad.easeOut" });
  }
}

function effectsLabel(turboMs: number, shieldMs: number): string {
  const parts: string[] = [];
  if (turboMs > 0) parts.push(`TURBO ${Math.ceil(turboMs / 1000)}s`);
  if (shieldMs > 0) parts.push(`ESCUDO ${Math.ceil(shieldMs / 1000)}s`);
  return parts.join("   ");
}
