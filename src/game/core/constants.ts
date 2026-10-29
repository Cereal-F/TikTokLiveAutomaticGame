/** Constantes de balanceamento. Mantidas fora do Phaser para que as regras sejam testáveis. */

/** Resolução lógica da arena (proporção vertical 9:16, adequada a transmissões verticais). */
export const WORLD = { width: 720, height: 1280 } as const;

export const PLAYER = {
  radius: 18,
  speed: 230,
  maxHp: 100,
  attackCooldownMs: 600,
  attackRange: 320,
  /** Tempo sem receber dano após ser atingido. */
  invulnerabilityMs: 600,
  projectileDamage: 1,
  boostedProjectileDamage: 2,
} as const;

export const ENEMY = {
  radius: 16,
  contactDamage: 8,
} as const;

export const PROJECTILE = {
  radius: 5,
  speed: 620,
  /** Distância além da qual o projétil é descartado. */
  maxTravel: 900,
} as const;

export const LIVE_EFFECTS = {
  /** Curtidas acumuladas necessárias para curar `likeHealAmount`. */
  likesPerHeal: 20,
  likeHealAmount: 10,
  commentScore: 5,
  giftBoostMs: 6_000,
  /** Multiplicador de cadência de ataque durante o boost. */
  boostAttackSpeedMultiplier: 1.6,
} as const;

export const WAVES = {
  intermissionMs: 2_500,
  maxEnemiesPerWave: 60,
  minSpawnIntervalMs: 250,
} as const;
