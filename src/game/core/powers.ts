/**
 * Poderes ativados por presentes da live. Quanto mais caro o presente, mais forte o poder.
 * O poder depende só do valor em diamantes, então funciona com qualquer nome de presente.
 */

export type GiftPowerKind = "turbo" | "shield" | "nova" | "storm";

export interface GiftPower {
  kind: GiftPowerKind;
  label: string;
  /** Diamantes mínimos para ativar este poder. */
  minDiamonds: number;
  /** Duração do turbo de ataque (0 = não ativa turbo). */
  turboMs: number;
  /** Duração do escudo (0 = não ativa escudo). */
  shieldMs: number;
  /** Dano em área aplicado aos inimigos dentro do raio (0 = sem dano em área). */
  blastDamage: number;
  /** Raio da área em pixels. Infinity significa a tela inteira. */
  blastRadius: number;
  /** Vida recuperada imediatamente. */
  heal: number;
}

/** Em ordem crescente de `minDiamonds`. */
export const GIFT_POWERS: readonly GiftPower[] = [
  { kind: "turbo", label: "TURBO", minDiamonds: 1, turboMs: 6_000, shieldMs: 0, blastDamage: 0, blastRadius: 0, heal: 0 },
  { kind: "shield", label: "ESCUDO", minDiamonds: 20, turboMs: 0, shieldMs: 5_000, blastDamage: 0, blastRadius: 0, heal: 0 },
  { kind: "nova", label: "NOVA", minDiamonds: 100, turboMs: 0, shieldMs: 0, blastDamage: 4, blastRadius: 260, heal: 0 },
  {
    kind: "storm",
    label: "TEMPESTADE",
    minDiamonds: 500,
    turboMs: 8_000,
    shieldMs: 0,
    blastDamage: 6,
    blastRadius: Number.POSITIVE_INFINITY,
    heal: 25,
  },
];

/** Poder do presente de maior nível que o valor alcança, ou null se o valor for zero. */
export function powerForGift(diamonds: number): GiftPower | null {
  let best: GiftPower | null = null;
  for (const power of GIFT_POWERS) {
    if (diamonds >= power.minDiamonds) best = power;
  }
  return best;
}

/** Nível do poder (1 a 4), usado para cores e destaques na tela. */
export function giftTier(power: GiftPower): number {
  return GIFT_POWERS.indexOf(power) + 1;
}
