import type Phaser from "phaser";
import type { LiveFeedback, SessionPhase } from "../core/GameSession.js";
import { WORLD } from "../core/constants.js";
import { formatTime } from "../core/format.js";
import type { ConnectionState } from "../../client/net/ReconnectingSocket.js";

const FONT = "monospace";
const MAX_FEEDBACK_LINES = 5;
const FEEDBACK_LIFETIME_MS = 6_000;

interface SessionSnapshot {
  hp: number;
  maxHp: number;
  wave: number;
  score: number;
  survivedMs: number;
  phase: SessionPhase;
  boostActive: boolean;
}

const TONE_COLORS: Record<LiveFeedback["tone"], string> = {
  score: "#ffd23f",
  heal: "#4ade80",
  boost: "#b36bff",
  chat: "#7ad7ff",
};

/** Painel da partida: vida, tempo, onda, pontuação, mensagens da live e estado da conexão. */
export class Hud {
  private readonly hpBack: Phaser.GameObjects.Rectangle;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly connectionText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly feedbackTexts: Phaser.GameObjects.Text[] = [];
  private readonly feedbackTimes: number[] = [];
  private readonly hpMaxWidth = 260;

  constructor(private readonly scene: Phaser.Scene) {
    const depth = 100;
    const label = { fontFamily: FONT, fontSize: "28px", color: "#e8ecff", stroke: "#000000", strokeThickness: 4 };

    this.hpBack = scene.add.rectangle(24, 24, this.hpMaxWidth, 22, 0x2a1a1a).setOrigin(0).setDepth(depth);
    this.hpFill = scene.add.rectangle(24, 24, this.hpMaxWidth, 22, 0x4ade80).setOrigin(0).setDepth(depth + 1);
    this.hpText = scene.add.text(24, 50, "", label).setDepth(depth);

    this.waveText = scene.add.text(WORLD.width / 2, 24, "", { ...label, fontSize: "34px" }).setOrigin(0.5, 0).setDepth(depth);
    this.timeText = scene.add.text(WORLD.width - 24, 24, "", label).setOrigin(1, 0).setDepth(depth);
    this.scoreText = scene.add.text(WORLD.width - 24, 60, "", { ...label, color: "#ffd23f" }).setOrigin(1, 0).setDepth(depth);

    this.connectionText = scene
      .add.text(24, WORLD.height - 24, "", { fontFamily: FONT, fontSize: "18px", color: "#8a93b8" })
      .setOrigin(0, 1)
      .setDepth(depth);

    this.bannerText = scene.add
      .text(WORLD.width / 2, WORLD.height * 0.4, "", { ...label, fontSize: "48px", color: "#ffd23f" })
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setAlpha(0);

    for (let i = 0; i < MAX_FEEDBACK_LINES; i += 1) {
      const text = scene.add
        .text(24, WORLD.height - 70 - i * 30, "", { fontFamily: FONT, fontSize: "22px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
        .setOrigin(0, 1)
        .setDepth(depth);
      this.feedbackTexts.push(text);
      this.feedbackTimes.push(0);
    }
  }

  update(snapshot: SessionSnapshot): void {
    const ratio = Math.max(0, Math.min(1, snapshot.hp / snapshot.maxHp));
    this.hpFill.width = this.hpMaxWidth * ratio;
    this.hpFill.fillColor = ratio > 0.35 ? 0x4ade80 : 0xf87171;
    this.hpText.setText(`VIDA ${Math.ceil(snapshot.hp)}/${snapshot.maxHp}${snapshot.boostActive ? "  TURBO" : ""}`);
    this.waveText.setText(`ONDA ${snapshot.wave}`);
    this.timeText.setText(`TEMPO ${formatTime(snapshot.survivedMs)}`);
    this.scoreText.setText(`PONTOS ${snapshot.score}`);
    this.fadeFeedback();
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
      // Desloca as linhas para cima; a mais recente fica na base.
      for (let i = this.feedbackTexts.length - 1; i > 0; i -= 1) {
        this.feedbackTexts[i]!.setText(this.feedbackTexts[i - 1]!.text);
        this.feedbackTexts[i]!.setColor(this.feedbackTexts[i - 1]!.style.color);
        this.feedbackTimes[i] = this.feedbackTimes[i - 1]!;
      }
      const top = this.feedbackTexts[0];
      if (!top) continue;
      top.setText(entry.text.slice(0, 60));
      top.setColor(TONE_COLORS[entry.tone]);
      top.setAlpha(1);
      this.feedbackTimes[0] = this.scene.time.now;
    }
  }

  showBanner(text: string): void {
    this.bannerText.setText(text).setAlpha(1).setScale(0.8);
    this.scene.tweens.add({ targets: this.bannerText, scale: 1, alpha: 0, duration: 1_800, ease: "Quad.easeOut" });
  }

  private fadeFeedback(): void {
    const now = this.scene.time.now;
    this.feedbackTexts.forEach((text, index) => {
      const age = now - (this.feedbackTimes[index] ?? 0);
      if (!text.text) return;
      text.setAlpha(age > FEEDBACK_LIFETIME_MS ? 0 : 1);
    });
  }
}

