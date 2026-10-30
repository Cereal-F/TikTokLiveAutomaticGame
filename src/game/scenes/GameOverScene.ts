import Phaser from "phaser";
import type { RunOutcome } from "../../shared/protocol.js";
import { CAMPAIGN, RUN, WORLD } from "../core/constants.js";
import { formatTime } from "../core/format.js";
import type { SessionStats } from "../core/GameSession.js";
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
}

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
};

/** Resumo da partida. Não há botão: a próxima partida começa sozinha, pois a transmissão é automática. */
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

    this.add
      .text(cx, 260, won ? "VITÓRIA!" : "FIM DE JOGO", {
        fontFamily: "monospace",
        fontSize: "72px",
        color: won ? "#ffd23f" : "#f87171",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 340, won ? "O REI COROADO CAIU" : `Fase alcançada: ${data.wave}/${CAMPAIGN.levels}`, {
        fontFamily: "monospace",
        fontSize: "34px",
        color: won ? "#ffd23f" : "#e8ecff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    const lines = [
      `Pontos: ${data.score}`,
      `Inimigos derrotados: ${data.kills}`,
      `Tempo: ${formatTime(data.survivedMs)}`,
    ];
    this.add
      .text(cx, 480, lines.join("\n"), {
        fontFamily: "monospace",
        fontSize: "34px",
        color: "#e8ecff",
        align: "center",
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    const recordLine = data.newRecord
      ? `NOVO RECORDE: FASE ${data.bestWave}/${CAMPAIGN.levels}!`
      : `Recorde: fase ${data.bestWave}/${CAMPAIGN.levels}`;
    this.add
      .text(cx, 720, recordLine, {
        fontFamily: "monospace",
        fontSize: "40px",
        color: "#ffd23f",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 800, `VITÓRIAS ${data.wins}   DERROTAS ${data.defeats}`, {
        fontFamily: "monospace",
        fontSize: "38px",
        color: "#e8ecff",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const countdown = this.add
      .text(cx, 900, "", { fontFamily: "monospace", fontSize: "30px", color: "#8a93b8" })
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
}
