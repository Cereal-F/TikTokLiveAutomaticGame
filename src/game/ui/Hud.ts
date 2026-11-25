import type Phaser from "phaser";
import type { LeaderboardEntry } from "../../shared/protocol.js";
import type { SessionPhase } from "../core/GameSession.js";
import { CAMPAIGN, WORLD } from "../core/constants.js";
import { formatTime } from "../core/format.js";
import { GIFT_POWERS, giftTier, powerSummary } from "../core/powers.js";
import { isFinalWave, upcomingWaves } from "../core/waves.js";

const FONT = "monospace";
const LEFT = 24;
const RIGHT = WORLD.width - 24;
const WIDTH = WORLD.width - 48;
/**
 * A barra superior do TikTok (nome do criador) cobre o alto da tela. Tudo da HUD começa abaixo dela.
 */
const TOP = 132;
const HP_BAR = { y: TOP + 44, height: 26 } as const;
const SHIELD_BAR = { y: HP_BAR.y + 32, height: 20 } as const;
const STRIP = { x: LEFT, y: 320, blockWidth: 128, blockHeight: 56, gap: 8, count: 5 } as const;
/** Painéis de legenda e de ranking, lado a lado, logo abaixo da faixa de ondas. */
const PANEL_Y = 400;
const PANEL_HEIGHT = 200;
const LEGEND_PANEL = { x: LEFT, width: 400 } as const;
const LEADER_PANEL = { x: 440, width: RIGHT - 440 } as const;
const LEADER_NAME_CHARS = 11;

/** Recorde e contadores da partida, guardados pelo servidor entre execuções. */
export interface RecordView {
  bestWave: number;
  wins: number;
  defeats: number;
}

interface SessionSnapshot {
  hp: number;
  maxHp: number;
  wave: number;
  score: number;
  survivedMs: number;
  phase: SessionPhase;
  turboRemainingMs: number;
  shieldRemainingMs: number;
  shieldHp: number;
  shieldMaxHp: number;
  berserkRemainingMs: number;
}

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

/**
 * Painel da partida. Elementos em faixas, de cima para baixo, sem sobreposição:
 * fase e tempo; vida; escudo (só com o escudo ativo); efeitos e pontos; recorde e contadores;
 * faixa de ondas; legenda dos presentes e ranking.
 */
export class Hud {
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly shieldBack: Phaser.GameObjects.Rectangle;
  private readonly shieldFill: Phaser.GameObjects.Rectangle;
  private readonly shieldText: Phaser.GameObjects.Text;
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly recordText: Phaser.GameObjects.Text;
  private readonly countersText: Phaser.GameObjects.Text;
  private readonly effectsText: Phaser.GameObjects.Text;
  private allTimeText!: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly leaderLines: Phaser.GameObjects.Text[] = [];
  private readonly waveBlocks: WaveBlock[] = [];
  private shownWave = -1;

  constructor(private readonly scene: Phaser.Scene) {
    const depth = 100;
    const label = { fontFamily: FONT, fontSize: "24px", color: "#e8ecff", stroke: "#000000", strokeThickness: 4 } as const;

    // Linha 1: fase à esquerda, tempo à direita.
    this.waveText = scene.add.text(LEFT, TOP, "", { ...label, fontSize: "34px", color: "#ffffff" }).setDepth(depth);
    this.timeText = scene.add.text(RIGHT, TOP + 6, "", label).setOrigin(1, 0).setDepth(depth);

    // Linha 2: vida, barra larga com o número dentro.
    scene.add.rectangle(LEFT, HP_BAR.y, WIDTH, HP_BAR.height, 0x2a1a1a).setOrigin(0).setDepth(depth);
    this.hpFill = scene.add.rectangle(LEFT, HP_BAR.y, WIDTH, HP_BAR.height, 0x4ade80).setOrigin(0).setDepth(depth + 1);
    this.hpText = scene.add
      .text(WORLD.width / 2, HP_BAR.y + HP_BAR.height / 2, "", { ...barLabel, fontSize: "20px" })
      .setOrigin(0.5)
      .setDepth(depth + 2);

    // Linha 3: escudo, reserva de dano que cai quando acaba. Só aparece com o escudo ativo.
    this.shieldBack = scene.add.rectangle(LEFT, SHIELD_BAR.y, WIDTH, SHIELD_BAR.height, 0x0e2a30).setOrigin(0).setDepth(depth).setVisible(false);
    this.shieldFill = scene.add.rectangle(LEFT, SHIELD_BAR.y, WIDTH, SHIELD_BAR.height, 0x67e8f9).setOrigin(0).setDepth(depth + 1).setVisible(false);
    this.shieldText = scene.add
      .text(WORLD.width / 2, SHIELD_BAR.y + SHIELD_BAR.height / 2, "", { ...barLabel, fontSize: "16px", color: "#e8ecff" })
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setVisible(false);

    // Linha 4: efeitos de tempo à esquerda, pontos à direita.
    this.effectsText = scene.add.text(LEFT, 236, "", { ...label, fontSize: "20px", color: "#b36bff" }).setDepth(depth);
    this.scoreText = scene.add.text(RIGHT, 236, "", { ...label, fontSize: "22px", color: "#ffd23f" }).setOrigin(1, 0).setDepth(depth);

    // Linha 5: recorde à esquerda, vitórias e derrotas à direita.
    this.recordText = scene.add.text(LEFT, 266, "", { ...label, fontSize: "20px", color: "#ffd23f" }).setDepth(depth);
    this.countersText = scene.add.text(RIGHT, 266, "", { ...label, fontSize: "20px" }).setOrigin(1, 0).setDepth(depth);

    this.buildWaveStrip(scene, depth);
    this.buildGiftLegend(scene, depth);
    this.buildLeaderPanel(scene, depth);

    this.bannerText = scene.add
      .text(WORLD.width / 2, WORLD.height * 0.4, "", { ...label, fontSize: "48px", color: "#ffd23f" })
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setAlpha(0);
  }

  update(snapshot: SessionSnapshot): void {
    const ratio = Math.max(0, Math.min(1, snapshot.hp / snapshot.maxHp));
    this.hpFill.width = WIDTH * ratio;
    this.hpFill.fillColor = ratio > 0.35 ? 0x4ade80 : 0xf87171;
    this.hpText.setText(`VIDA ${Math.ceil(snapshot.hp)}/${snapshot.maxHp}`);
    this.waveText.setText(`FASE ${snapshot.wave}/${CAMPAIGN.levels}`);
    this.timeText.setText(`TEMPO ${formatTime(snapshot.survivedMs)}`);
    this.scoreText.setText(`PONTOS ${snapshot.score}`);
    this.effectsText.setText(effectsLabel(snapshot.turboRemainingMs, snapshot.berserkRemainingMs));
    this.updateShield(snapshot.shieldHp, snapshot.shieldMaxHp, snapshot.shieldRemainingMs);
    this.showWaveStrip(snapshot.wave);
  }

  /** Barra do escudo: a reserva de dano que ele ainda absorve, e o tempo que resta. */
  private updateShield(hp: number, maxHp: number, remainingMs: number): void {
    const active = hp > 0 && remainingMs > 0;
    this.shieldBack.setVisible(active);
    this.shieldFill.setVisible(active);
    this.shieldText.setVisible(active);
    if (!active) return;
    this.shieldFill.width = WIDTH * Math.max(0, Math.min(1, hp / maxHp));
    this.shieldText.setText(`ESCUDO ${Math.ceil(hp)}/${maxHp} · ${Math.ceil(remainingMs / 1000)}s`);
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

  /** Legenda fixa: cada faixa de diamantes, o nome do poder e o que ele faz. */
  private buildGiftLegend(scene: Phaser.Scene, depth: number): void {
    const { x, width } = LEGEND_PANEL;
    scene.add.rectangle(x, PANEL_Y, width, PANEL_HEIGHT, 0x000000, 0.55).setOrigin(0).setDepth(depth - 1);
    scene.add
      .text(x + 12, PANEL_Y + 10, "O QUE OS PRESENTES FAZEM", { ...barLabel, fontSize: "18px", color: "#ffd23f" })
      .setDepth(depth);
    GIFT_POWERS.forEach((power, i) => {
      const y = PANEL_Y + 52 + i * 36;
      const color = TIER_COLORS[giftTier(power)] ?? "#ffffff";
      scene.add
        .text(x + 12, y, `${power.minDiamonds}+ ${power.label}`, { ...barLabel, fontSize: "18px", color })
        .setDepth(depth);
      scene.add
        .text(x + 186, y + 2, powerSummary(power), { fontFamily: FONT, fontSize: "15px", color: "#e8ecff" })
        .setDepth(depth);
    });
  }

  /** Painel do ranking: top 3 da rodada, com o maior presenteador da live embaixo. */
  private buildLeaderPanel(scene: Phaser.Scene, depth: number): void {
    const { x, width } = LEADER_PANEL;
    scene.add.rectangle(x, PANEL_Y, width, PANEL_HEIGHT, 0x000000, 0.55).setOrigin(0).setDepth(depth - 1);
    scene.add
      .text(x + 12, PANEL_Y + 10, "TOP 3 DA RODADA", { ...barLabel, fontSize: "18px", color: "#ffd23f" })
      .setDepth(depth);
    for (let i = 0; i < 3; i += 1) {
      this.leaderLines.push(
        scene.add.text(x + 12, PANEL_Y + 52 + i * 36, "", { ...barLabel, fontSize: "17px" }).setDepth(depth),
      );
    }
    scene.add
      .text(x + 12, PANEL_Y + 150, "TOP DA LIVE", { ...barLabel, fontSize: "16px", color: "#ffd23f" })
      .setDepth(depth);
    this.allTimeText = scene.add
      .text(x + 12, PANEL_Y + 172, "", { ...barLabel, fontSize: "18px" })
      .setDepth(depth);
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

  showBanner(text: string): void {
    this.bannerText.setText(text).setAlpha(1).setScale(0.8);
    this.scene.tweens.add({ targets: this.bannerText, scale: 1, alpha: 0, duration: 1_800, ease: "Quad.easeOut" });
  }
}

const barLabel = { fontFamily: FONT, color: "#e8ecff", stroke: "#000000", strokeThickness: 3 } as const;

function effectsLabel(turboMs: number, berserkMs: number): string {
  const parts: string[] = [];
  if (turboMs > 0) parts.push(`TURBO ${Math.ceil(turboMs / 1000)}s`);
  if (berserkMs > 0) parts.push(`FÚRIA ${Math.ceil(berserkMs / 1000)}s`);
  return parts.join("   ");
}
