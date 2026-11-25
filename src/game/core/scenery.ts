import { CAMPAIGN } from "./constants.js";
import { KIND_BY_CHAPTER, type EnemyKind } from "./waves.js";

/** Capítulo da campanha: cada um tem o próprio cenário, cor e tipo de inimigo. */
export interface Chapter {
  /** Posição do capítulo, a partir de 0. */
  index: number;
  /** Tipo de inimigo comum deste capítulo. */
  kind: EnemyKind;
  /** Nome do cenário, mostrado na troca de capítulo. */
  name: string;
  /** Nome, em português, dos inimigos que estreiam neste capítulo. */
  enemies: string;
  /** Chave da textura do chão (gerada em render/textures.ts). */
  floorKey: string;
  /** Cor de destaque do cenário, usada na troca de capítulo. */
  color: number;
}

/** Um cenário por tipo de inimigo, na mesma ordem de KIND_BY_CHAPTER. */
const SCENERY = [
  { name: "CIRCUITO VIRAL", enemies: "vírus", floorKey: "floor", color: 0x3a7bff },
  { name: "RUÍNAS ROXAS", enemies: "atiradores", floorKey: "floor-ruins", color: 0xb36bff },
  { name: "DESERTO DE MAGMA", enemies: "saltadores", floorKey: "floor-magma", color: 0xff9a3c },
  { name: "FORTALEZA DE AÇO", enemies: "ouriços", floorKey: "floor-steel", color: 0x67e8f9 },
] as const;

/** Capítulo a que pertence a onda (as ondas 1-5 são o capítulo 0, e assim por diante). */
export function chapterForWave(wave: number): Chapter {
  const index = Math.min(
    SCENERY.length - 1,
    Math.floor((Math.max(1, Math.floor(wave)) - 1) / CAMPAIGN.chapterLength),
  );
  const scenery = SCENERY[index]!;
  return { index, kind: KIND_BY_CHAPTER[index]!, ...scenery };
}
