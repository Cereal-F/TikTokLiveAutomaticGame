import { BERSERK, LIVE_EFFECTS } from "./constants.js";

/**
 * Poderes ativados por presentes da live. Quanto mais caro cada unidade do presente,
 * mais forte o poder. O poder depende só do valor de uma unidade, então funciona com qualquer nome de presente.
 */

export type GiftPowerKind = "turbo" | "shield" | "nova" | "storm";

/** Dano que mata qualquer inimigo ou chefe de um golpe. */
export const HITKILL_DAMAGE = BERSERK.hitKillDamage;

/** Duração da fúria por unidade: dá para limpar cerca de 10 fases (100 e 500 têm a mesma fúria). */
export const FURY_MS = 90_000;

export interface GiftPower {
  kind: GiftPowerKind;
  label: string;
  /** Diamantes de UMA unidade do presente necessários para ativar este poder. */
  minDiamonds: number;
  /** Turbo de ataque por unidade (0 = não ativa turbo). Acumula com outros presentes. */
  turboMs: number;
  /** Escudo por unidade (0 = não ativa escudo). Acumula com outros presentes. */
  shieldMs: number;
  /** Fúria por unidade (0 = não ativa fúria). Acumula com outros presentes. */
  berserkMs: number;
  /** Dano em área aplicado uma vez por presente (0 = sem explosão). */
  blastDamage: number;
  /** Raio da área em pixels. Infinity significa a tela inteira. */
  blastRadius: number;
  /** Vida recuperada imediatamente. */
  heal: number;
}

/** Em ordem crescente de `minDiamonds`. */
export const GIFT_POWERS: readonly GiftPower[] = [
  // Rosa (1+): ataque em dobro. Cada rosa soma 8 s, então mandar várias rosas aumenta o turbo.
  { kind: "turbo", label: "TURBO", minDiamonds: 1, turboMs: 8_000, shieldMs: 0, berserkMs: 0, blastDamage: 0, blastRadius: 0, heal: 0 },
  // Chapéu (20+): imunidade a dano. Também soma por unidade.
  { kind: "shield", label: "ESCUDO", minDiamonds: 20, turboMs: 0, shieldMs: 6_000, berserkMs: 0, blastDamage: 0, blastRadius: 0, heal: 0 },
  // Leão (100+): fúria, com explosão que limpa os inimigos em volta do personagem.
  {
    kind: "nova",
    label: "NOVA",
    minDiamonds: 100,
    turboMs: 0,
    shieldMs: 0,
    berserkMs: FURY_MS,
    blastDamage: HITKILL_DAMAGE,
    blastRadius: 280,
    heal: 0,
  },
  // Foguete (500+): a mesma fúria do leão, mais explosão na tela inteira e cura.
  {
    kind: "storm",
    label: "TEMPESTADE",
    minDiamonds: 500,
    turboMs: 0,
    shieldMs: 0,
    berserkMs: FURY_MS,
    blastDamage: HITKILL_DAMAGE,
    blastRadius: Number.POSITIVE_INFINITY,
    heal: 30,
  },
];

/**
 * Poder do presente de maior nível que o valor de UMA unidade alcança, ou null se o valor for zero.
 * Um presente de 20 rosas tem unidade de 1 diamante: é uma rosa, vinte vezes.
 */
export function powerForGift(unitDiamonds: number): GiftPower | null {
  let best: GiftPower | null = null;
  for (const power of GIFT_POWERS) {
    if (unitDiamonds >= power.minDiamonds) best = power;
  }
  return best;
}

/** Tempo concedido por `count` unidades do presente. Os efeitos de tempo somam; explosão e cura valem uma vez. */
export interface GiftGrant {
  turboMs: number;
  shieldMs: number;
  berserkMs: number;
}

export function grantFor(power: GiftPower, count: number): GiftGrant {
  const units = Math.max(1, count);
  return {
    turboMs: power.turboMs * units,
    shieldMs: power.shieldMs * units,
    berserkMs: power.berserkMs * units,
  };
}

/** Nível do poder (1 a 4), usado para cores e destaques na tela. */
export function giftTier(power: GiftPower): number {
  return GIFT_POWERS.indexOf(power) + 1;
}

/** Texto curto do efeito que um presente deu, para a tela (ex.: "+160 s de TURBO"). */
export function effectText(power: GiftPower, count: number): string {
  const grant = grantFor(power, count);
  const seconds = (ms: number): number => Math.round(ms / 1000);
  switch (power.kind) {
    case "turbo":
      return `+${seconds(grant.turboMs)} s de TURBO`;
    case "shield":
      return `+${seconds(grant.shieldMs)} s de ESCUDO`;
    case "nova":
      return `+${seconds(grant.berserkMs)} s de FÚRIA · explosão`;
    case "storm":
      return `+${seconds(grant.berserkMs)} s de FÚRIA · tela limpa · +${power.heal} vida`;
  }
}

/** Resumo curto do efeito, para o painel de presentes na tela. */
export function powerSummary(power: GiftPower): string {
  const seconds = (ms: number): number => Math.round(ms / 1000);
  switch (power.kind) {
    case "turbo":
      return `ataque ${LIVE_EFFECTS.boostAttackSpeedMultiplier}x e dano x2 · ${seconds(power.turboMs)}s cada`;
    case "shield":
      return `invulnerável · ${seconds(power.shieldMs)}s cada`;
    case "nova":
      return `fúria ${seconds(power.berserkMs)}s · explosão`;
    case "storm":
      return `fúria ${seconds(power.berserkMs)}s · tela toda · +${power.heal} vida`;
  }
}
