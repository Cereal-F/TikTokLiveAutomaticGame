import type Phaser from "phaser";
import type { ConnectionState } from "../../client/net/ReconnectingSocket.js";
import type { LeaderboardEntry } from "../../shared/protocol.js";
import type { LiveFeedback, SessionPhase } from "../core/GameSession.js";
import { CAMPAIGN, WORLD } from "../core/constants.js";
import { formatTime } from "../core/format.js";
import { GIFT_POWERS, giftTier, powerSummary } from "../core/powers.js";
import { isFinalWave, upcomingWaves } from "../core/waves.js";

const FONT = "monospace";
const FEEDBACK_LIFETIME_MS = 6_000;
const MAX_FEEDBACK_LINES = 5;
const MAX_GIFT_LINES = 4;
const MAX_TEXT_CHARS = 40;
const LEADER_NAME_CHARS = 11;

/** Recorde e contadores da partida, guardados pelo servidor entre execuções. */
export interface RecordView {
  bestWave: number;
  wins: number;
  defeats: number;
}

/** Faixa de ondas: a atual e as próximas, lado a lado, no topo da tela. */
const STRIP = { x: 24, y: 180, blockWidth: 128, blockHeight: 56, gap: 8, count: 5 } as const;
const PANEL_Y = 262;
const LEGEND_PANEL = { x: 24, width: 384, height: 160 } as const;
const LEADER_PANEL = { x: 420, width: 276, height: 200 } as const;
/** Borda direita do texto do top 3, com margem interna do painel. */
const LEADER_RIGHT = LEADER_PANEL.x + LEADER_PANEL.width - 12;

interface SessionSnapshot {
  hp: number;
  maxHp: number;
  wave: number;
  score: number;
  survivedMs: number;
  phase: SessionPhase;
  turboRemainingMs: number;
  shieldRemainingMs: number;
  berserkRemainingMs: number;
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

const STRIP_COLORS = {
  current: 0xffd23f,
  normal: 0x1b2340,
  boss: 0x4a1020,
  bossBorder: 0xff5e7e,
} as const;

interface WaveBlock {
  body: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  horns: Phaser.GameObjects.Graphics;
}

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
  private readonly countersText: Phaser.GameObjects.Text;
  private readonly effectsText: Phaser.GameObjects.Text;
  private readonly connectionText: Phaser.GameObjects.Text;
  private readonly allTimeText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly leaderLines: Phaser.GameObjects.Text[] = [];
  private readonly waveBlocks: WaveBlock[] = [];
  private shownWave = -1;
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
    this.countersText = scene.add
      .text(WORLD.width - 24, 124, "", { ...label, fontSize: "22px", color: "#e8ecff" })
      .setOrigin(1, 0)
      .setDepth(depth);

    this.buildWaveStrip(scene, depth);
    this.buildGiftLegend(scene, depth);

    // Painel do top 3 de presentes, ao lado da legenda.
    const panelX = LEADER_PANEL.x;
    scene.add.rectangle(panelX, PANEL_Y, LEADER_PANEL.width, LEADER_PANEL.height, 0x000000, 0.45).setOrigin(0).setDepth(depth - 1);
    scene.add
      .text(LEADER_RIGHT, PANEL_Y + 8, "TOP 3 DA RODADA", { ...label, fontSize: "20px", color: "#ffd23f" })
      .setOrigin(1, 0)
      .setDepth(depth);
    for (let i = 0; i < 3; i += 1) {
      this.leaderLines.push(
        scene.add
          .text(LEADER_RIGHT, PANEL_Y + 46 + i * 36, "", { ...label, fontSize: "20px" })
          .setOrigin(1, 0)
          .setDepth(depth),
      );
    }

    // Espaço de baixo do painel: o maior presenteador de toda a live, que não zera entre rodadas.
    scene.add
      .text(LEADER_RIGHT, PANEL_Y + 150, "TOP DA LIVE", { ...label, fontSize: "18px", color: "#ffd23f" })
      .setOrigin(1, 0)
      .setDepth(depth);
    this.allTimeText = scene.add
      .text(LEADER_RIGHT, PANEL_Y + 174, "", { ...label, fontSize: "20px", color: "#e8ecff" })
      .setOrigin(1, 0)
      .setDepth(depth);

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
    this.waveText.setText(`FASE ${snapshot.wave}/${CAMPAIGN.levels}`);
    this.timeText.setText(`TEMPO ${formatTime(snapshot.survivedMs)}`);
    this.scoreText.setText(`PONTOS ${snapshot.score}`);
    this.effectsText.setText(effectsLabel(snapshot.turboRemainingMs, snapshot.shieldRemainingMs, snapshot.berserkRemainingMs));
    this.showWaveStrip(snapshot.wave);
    const now = this.scene.time.now;
    this.feedback.fade(now);
    this.gifts.fade(now);
  }

  /** Faixa de ondas: blocos da onda atual e das próximas, com chifres nas rodadas de chefe. */
  private buildWaveStrip(scene: Phaser.Scene, depth: number): void {
    for (let i = 0; i < STRIP.count; i += 1) {
      const x = STRIP.x + i * (STRIP.blockWidth + STRIP.gap);
      const y = STRIP.y;
      const body = scene.add.rectangle(x, y, STRIP.blockWidth, STRIP.blockHeight, STRIP_COLORS.normal).setOrigin(0).setDepth(depth - 1);
      const border = scene.add
        .rectangle(x, y, STRIP.blockWidth, STRIP.blockHeight, 0x000000, 0)
        .setOrigin(0)
        .setStrokeStyle(3, STRIP_COLORS.bossBorder)
        .setDepth(depth)
        .setVisible(false);
      const label = scene.add
        .text(x + STRIP.blockWidth / 2, y + STRIP.blockHeight / 2, "", {
          fontFamily: FONT,
          fontSize: "18px",
          color: "#e8ecff",
          align: "center",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(depth);
      // Chifres acima do bloco, desenhados uma vez e exibidos só nas rodadas de chefe.
      const cx = x + STRIP.blockWidth / 2;
      const horns = scene.add.graphics().setDepth(depth).setVisible(false);
      horns.fillStyle(0xf8fafc, 1);
      horns.fillTriangle(cx - 24, y, cx - 12, y, cx - 30, y - 16);
      horns.fillTriangle(cx + 24, y, cx + 12, y, cx + 30, y - 16);
      this.waveBlocks.push({ body, border, label, horns });
    }
  }

  private showWaveStrip(wave: number): void {
    if (wave === this.shownWave) return;
    this.shownWave = wave;
    upcomingWaves(wave, STRIP.count).forEach((entry, i) => {
      const block = this.waveBlocks[i];
      if (!block) return;
      const current = i === 0;
      // Ondas além da última fase não existem: o bloco fica apagado.
      const beyondCampaign = entry.wave > CAMPAIGN.levels;
      const showBoss = entry.isBoss && !beyondCampaign;
      block.body.setFillStyle(current ? STRIP_COLORS.current : showBoss ? STRIP_COLORS.boss : STRIP_COLORS.normal);
      block.body.setAlpha(beyondCampaign ? 0.25 : 1);
      block.border.setVisible(showBoss);
      block.horns.setVisible(showBoss);
      let text = `ONDA ${entry.wave}`;
      if (beyondCampaign) text = "";
      else if (current) text = `ONDA ${entry.wave}\nAGORA`;
      else if (showBoss) text = `ONDA ${entry.wave}\n${isFinalWave(entry.wave) ? "CHEFE FINAL" : "CHEFE"}`;
      block.label.setText(text);
      block.label.setColor(current ? "#0b0b12" : "#e8ecff");
    });
  }

  /** Legenda fixa: o que cada faixa de diamantes faz. */
  private buildGiftLegend(scene: Phaser.Scene, depth: number): void {
    const { x, width, height } = LEGEND_PANEL;
    scene.add.rectangle(x, PANEL_Y, width, height, 0x000000, 0.45).setOrigin(0).setDepth(depth - 1);
    scene.add
      .text(x + 12, PANEL_Y + 8, "O QUE OS PRESENTES FAZEM", {
        fontFamily: FONT,
        fontSize: "18px",
        color: "#ffd23f",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setDepth(depth);
    GIFT_POWERS.forEach((power, i) => {
      const color = TIER_COLORS[giftTier(power)] ?? "#ffffff";
      const line = `${String(power.minDiamonds).padStart(3)}+ ${power.label.padEnd(10)} ${powerSummary(power)}`;
      scene.add
        .text(x + 12, PANEL_Y + 44 + i * 28, line, {
          fontFamily: FONT,
          fontSize: "15px",
          color,
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setDepth(depth);
    });
  }

  /** Mostra o recorde e os contadores de vitórias e derrotas (null = ainda não carregado). */
  setRecord(record: RecordView | null): void {
    this.recordText.setText(record === null ? "" : `RECORDE: FASE ${record.bestWave}/${CAMPAIGN.levels}`);
    this.countersText.setText(record === null ? "" : `VITÓRIAS ${record.wins}   DERROTAS ${record.defeats}`);
  }

  /** Top 3 da rodada e o maior presenteador da live (null = ninguém ainda). */
  setLeaderboard(entries: LeaderboardEntry[], allTime: LeaderboardEntry | null): void {
    this.leaderLines.forEach((line, index) => {
      const entry = entries[index];
      line.setText(entry ? `${index + 1}. ${entry.userName.slice(0, LEADER_NAME_CHARS)} ${entry.diamonds}` : "");
    });
    this.allTimeText.setText(allTime ? `${allTime.userName.slice(0, LEADER_NAME_CHARS)} ${allTime.diamonds}` : "—");
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

function effectsLabel(turboMs: number, shieldMs: number, berserkMs: number): string {
  const parts: string[] = [];
  if (turboMs > 0) parts.push(`TURBO ${Math.ceil(turboMs / 1000)}s`);
  if (shieldMs > 0) parts.push(`ESCUDO ${Math.ceil(shieldMs / 1000)}s`);
  if (berserkMs > 0) parts.push(`FÚRIA ${Math.ceil(berserkMs / 1000)}s`);
  return parts.join("   ");
}
