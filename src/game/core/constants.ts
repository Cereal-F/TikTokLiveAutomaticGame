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
  /** Multiplicador de cadência de ataque durante o turbo. */
  boostAttackSpeedMultiplier: 1.6,
} as const;

export const WAVES = {
  intermissionMs: 2_500,
  maxEnemiesPerWave: 60,
  minSpawnIntervalMs: 250,
} as const;

/**
 * Piloto automático: o personagem se move sozinho (a transmissão é automática).
 * Distâncias em pixels da arena lógica.
 */
export const AUTOPILOT = {
  /** Faixa junto às bordas em que o personagem é empurrado para dentro. */
  edgeMargin: 130,
  /** Inimigo mais perto que isto faz o personagem fugir. */
  fleeDistance: 150,
  /** Entre fuga e órbita, o personagem circula o inimigo mais próximo (dentro do alcance de ataque). */
  orbitDistance: 300,
  /** Raio considerado ao calcular a fuga de vários inimigos. */
  dangerRadius: 220,
  /** Peso do empurrão das bordas em relação às outras intenções. */
  edgePushWeight: 2.5,
  /** Sem inimigos, o personagem vagueia entre pontos sorteados dentro desta margem. */
  wanderInset: 200,
  waypointReachedDistance: 40,
} as const;

/** Reinício automático da partida após a derrota. */
export const RUN = {
  restartDelayMs: 6_000,
} as const;
