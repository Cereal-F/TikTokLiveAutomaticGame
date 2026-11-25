import Phaser from "phaser";
import type { Podium, PodiumEntry, RunOutcome } from "../../shared/protocol.js";
import { CAMPAIGN, RUN, WORLD } from "../core/constants.js";
import { formatTime } from "../core/format.js";
import type { SessionStats } from "../core/GameSession.js";
import { AvatarView, requestAvatar } from "../ui/avatars.js";
import { confetti, shockwave } from "../ui/effects.js";
import { SCENE_KEYS } from "./keys.js";

/** Dados da partida encerrada, recebidos da arena. */
export interface GameOverData extends SessionStats {
  /** Vitória (chefe final derrotado) ou derrota (vida zerada). */
  outcome: RunOutcome;
  /** Contadores depois desta partida. */
  wins: number;
  defeats: number;
  /** Maior fase já alcançada (recorde) no momento do fim. */
  bestWave: number;
  /** Verdadeiro se esta partida superou o recorde anterior. */
  newRecord: boolean;
  /** Quem mais apoiou a rodada (presentes, ou curtidas se ninguém presenteou). */
  podium: Podium;
}

const EMPTY_PODIUM: Podium = { basis: "diamonds", entries: [] };

const EMPTY_DATA: GameOverData = {
  outcome: "defeat",
  wave: 1,
  score: 0,
  kills: 0,
  survivedMs: 0,
  wins: 0,
  defeats: 0,
  bestWave: 0,
  newRecord: false,
  podium: EMPTY_PODIUM,
};

/** Posição do pódio: 1º no centro e mais alto; 2º à esquerda; 3º à direita. */
interface PodiumSlot {
  x: number;
  blockHeight: number;
  avatarRadius: number;
  color: number;
  textColor: string;
}

const SLOTS: readonly PodiumSlot[] = [
  { x: WORLD.width / 2, blockHeight: 190, avatarRadius: 64, color: 0xffd23f, textColor: "#ffd23f" },
  { x: WORLD.width / 2 - 196, blockHeight: 150, avatarRadius: 56, color: 0xc0c7d6, textColor: "#c0c7d6" },
  { x: WORLD.width / 2 + 196, blockHeight: 120, avatarRadius: 56, color: 0xcd7f32, textColor: "#e0a070" },
];

const BLOCK_WIDTH = 180;
const PODIUM_BASE_Y = 660;
/** Intervalo entre a entrada de um lugar do pódio e o próximo (do 3º ao 1º). */
const STEP_MS = 800;
const PODIUM_START_MS = 500;

function clip(text: string, maxChars: number): string {
  const chars = [...text];
  return chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join("")}…` : text;
}

/**
 * Resumo da partida: resultado, pódio animado com as fotos de quem mais apoiou a rodada e os contadores.
 * Não há botão: a próxima partida começa sozinha, pois a transmissão é automática.
 */
export class GameOverScene extends Phaser.Scene {
  private data: GameOverData = EMPTY_DATA;

  constructor() {
    super(SCENE_KEYS.gameOver);
  }

  init(data: GameOverData | undefined): void {
    this.data = data ?? EMPTY_DATA;
  }

  create(): void {
    const cx = WORLD.width / 2;
    const data = this.data;
    const won = data.outcome === "victory";

    const title = this.add
      .text(cx, 120, won ? "VITÓRIA!" : "FIM DE JOGO", {
        fontFamily: "monospace",
        fontSize: "72px",
        color: won ? "#ffd23f" : "#f87171",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 600, ease: "Back.easeOut" });

    this.add
      .text(cx, 196, won ? "O REI COROADO CAIU" : `Fase alcançada: ${data.wave}/${CAMPAIGN.levels}`, {
        fontFamily: "monospace",
        fontSize: "30px",
        color: won ? "#ffd23f" : "#e8ecff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.buildPodium(data.podium);

    this.add
      .text(cx, 720, `Pontos: ${data.score}   Inimigos: ${data.kills}`, {
        fontFamily: "monospace",
        fontSize: "26px",
        color: "#e8ecff",
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 758, `Tempo: ${formatTime(data.survivedMs)}`, { fontFamily: "monospace", fontSize: "26px", color: "#e8ecff" })
      .setOrigin(0.5);

    const recordLine = data.newRecord
      ? `NOVO RECORDE: FASE ${data.bestWave}/${CAMPAIGN.levels}!`
      : `Recorde: fase ${data.bestWave}/${CAMPAIGN.levels}`;
    this.add
      .text(cx, 830, recordLine, {
        fontFamily: "monospace",
        fontSize: "34px",
        color: "#ffd23f",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 886, `VITÓRIAS ${data.wins}   DERROTAS ${data.defeats}`, {
        fontFamily: "monospace",
        fontSize: "30px",
        color: "#e8ecff",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const countdown = this.add
      .text(cx, 1000, "", { fontFamily: "monospace", fontSize: "28px", color: "#8a93b8" })
      .setOrigin(0.5);

    let remaining = Math.ceil(RUN.restartDelayMs / 1000);
    const show = (): void => countdown.setText(`Nova partida em ${remaining}s`);
    show();
    this.time.addEvent({
      delay: 1_000,
      repeat: remaining - 1,
      callback: () => {
        remaining -= 1;
        if (remaining <= 0) {
          this.scene.start(SCENE_KEYS.arena);
          return;
        }
        show();
      },
    });
  }

  /**
   * Pódio com animação: os lugares sobem do 3º ao 1º. As fotos carregam antes de começar;
   * se alguma falhar, o espaço mostra a inicial do nome.
   */
  private buildPodium(podium: Podium): void {
    const cx = WORLD.width / 2;
    const header = this.add
      .text(cx, 262, `TOP 3 DA RODADA · ${podium.basis === "likes" ? "CURTIDAS" : "DIAMANTES"}`, {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#ffd23f",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: header, alpha: 1, duration: 400 });

    if (podium.entries.length === 0) {
      this.add
        .text(cx, 470, "Nenhum presente ou curtida nesta rodada.", {
          fontFamily: "monospace",
          fontSize: "26px",
          color: "#8a93b8",
          align: "center",
          wordWrap: { width: 600 },
        })
        .setOrigin(0.5);
      return;
    }

    const start = (): void => {
      const entries = podium.entries.slice(0, SLOTS.length);
      // Do 3º ao 1º: o campeão entra por último e com destaque.
      const order = SLOTS.map((_, index) => index)
        .filter((index) => index < entries.length)
        .reverse();
      order.forEach((index, step) => {
        this.animateSlot(entries[index]!, SLOTS[index]!, index === 0, PODIUM_START_MS + step * STEP_MS);
      });
    };

    for (const entry of podium.entries) {
      if (entry.avatarUrl) requestAvatar(this, entry.avatarUrl);
    }
    if (this.load.isLoading()) {
      this.load.once("complete", start);
      this.events.once("shutdown", () => this.load.off("complete", start));
    } else {
      start();
    }
  }

  /** Um lugar do pódio: o bloco sobe, a foto cai com quique e o nome aparece. O 1º ganha coroa e confete. */
  private animateSlot(entry: PodiumEntry, slot: PodiumSlot, champion: boolean, delayMs: number): void {
    const left = slot.x - BLOCK_WIDTH / 2;
    const name = entry.userName || entry.userId;

    const rise = { value: 0 };
    const block = this.add.graphics().setDepth(1);
    const drawBlock = (): void => {
      const height = slot.blockHeight * rise.value;
      block.clear();
      if (height <= 0) return;
      const top = PODIUM_BASE_Y - height;
      block.fillStyle(0x111528, 1).fillRect(left, top, BLOCK_WIDTH, height).lineStyle(4, slot.color, 1).strokeRect(left, top, BLOCK_WIDTH, height);
    };
    this.tweens.add({ targets: rise, value: 1, duration: 650, delay: delayMs, ease: "Cubic.easeOut", onUpdate: drawBlock });

    const finalY = PODIUM_BASE_Y - slot.blockHeight - slot.avatarRadius - 14;
    const avatar = new AvatarView(this, 10);
    const drop = { value: 0 };
    avatar.setAlpha(0);
    avatar.place(slot.x, finalY - 140, slot.avatarRadius, name, slot.color, entry.avatarUrl);
    this.tweens.add({
      targets: drop,
      value: 1,
      duration: 700,
      delay: delayMs + 250,
      ease: "Bounce.easeOut",
      onUpdate: () => {
        avatar.setAlpha(Math.min(1, drop.value * 2));
        avatar.place(slot.x, finalY - (1 - drop.value) * 140, slot.avatarRadius, name, slot.color, entry.avatarUrl);
      },
    });

    const label = { fontFamily: "monospace", stroke: "#000000", strokeThickness: 4 } as const;
    const texts = [
      this.add.text(slot.x, PODIUM_BASE_Y - slot.blockHeight + 16, clip(name, 12), { ...label, fontSize: "24px", color: "#e8ecff" }).setOrigin(0.5, 0),
      this.add
        .text(slot.x, PODIUM_BASE_Y - slot.blockHeight + 50, clip(`@${entry.userId}`, 14), { fontFamily: "monospace", fontSize: "18px", color: "#8a93b8" })
        .setOrigin(0.5, 0),
      this.add.text(slot.x, PODIUM_BASE_Y - 34, `${entry.score}`, { ...label, fontSize: "36px", color: slot.textColor }).setOrigin(0.5),
    ];
    for (const text of texts) {
      text.setDepth(3).setAlpha(0);
      this.tweens.add({ targets: text, alpha: 1, duration: 400, delay: delayMs + 500 });
    }

    if (!champion) return;
    this.celebrateChampion(slot, finalY, delayMs + 900);
  }

  /** Destaque do campeão: coroa que cai, anel dourado, confete e um brilho que pulsa na base. */
  private celebrateChampion(slot: PodiumSlot, avatarY: number, delayMs: number): void {
    const avatarTop = avatarY - slot.avatarRadius;
    const bandTop = avatarTop - 20;
    const crown = this.add.graphics().setDepth(11).setAlpha(0);
    const x = slot.x;
    crown
      .fillStyle(0xffd23f, 1)
      .fillRect(x - 34, bandTop, 68, 16)
      .fillTriangle(x - 34, bandTop, x - 34, bandTop - 30, x - 12, bandTop)
      .fillTriangle(x - 12, bandTop, x, bandTop - 42, x + 12, bandTop)
      .fillTriangle(x + 12, bandTop, x + 34, bandTop - 30, x + 34, bandTop);
    crown.setY(-40);
    this.tweens.add({ targets: crown, y: 0, alpha: 1, duration: 600, delay: delayMs, ease: "Bounce.easeOut" });

    this.time.delayedCall(delayMs, () => {
      shockwave(this, slot.x, avatarY, 120, slot.color, 700, 6);
      confetti(this, 70);
    });

    const glow = this.add
      .rectangle(slot.x, PODIUM_BASE_Y - slot.blockHeight / 2, BLOCK_WIDTH + 16, slot.blockHeight + 16)
      .setStrokeStyle(4, slot.color, 1)
      .setFillStyle(0x000000, 0)
      .setDepth(0)
      .setAlpha(0);
    this.tweens.add({ targets: glow, alpha: 0.9, yoyo: true, repeat: -1, duration: 700, delay: delayMs });
  }
}
