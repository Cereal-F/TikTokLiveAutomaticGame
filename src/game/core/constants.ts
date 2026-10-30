/** Constantes de balanceamento. Mantidas fora do Phaser para que as regras sejam testáveis. */

/** Resolução lógica da arena (proporção vertical 9:16, adequada a transmissões verticais). */
export const WORLD = { width: 720, height: 1280 } as const;

export const PLAYER = {
  radius: 18,
  speed: 260,
  maxHp: 100,
  /**
   * Aceleração máxima (px/s²): o personagem ganha e perde velocidade aos poucos, sem trepidar.
   * Alta o bastante para que a arrancada (dash) chegue perto da velocidade máxima.
   */
  acceleration: 2_400,
  attackCooldownMs: 450,
  attackRange: 320,
  /** Tempo sem receber dano após ser atingido. */
  invulnerabilityMs: 600,
  projectileDamage: 1,
  boostedProjectileDamage: 2,
} as const;

export const ENEMY = {
  radius: 16,
  contactDamage: 8,
  /** Inimigos a menos desta distância se afastam uns dos outros: evita formarem um bloco. */
  separationRadius: 60,
  separationWeight: 2.2,
} as const;

/** Chefes: aparecem a cada `every` ondas. Atributos e padrões de cada chefe ficam em bosses.ts. */
export const BOSS = {
  every: 5,
  /** Quantos pontos vale o chefe em relação a um inimigo comum. */
  pointsMultiplier: 5,
} as const;

/** Campanha: `levels` ondas no total; a última é o chefe final. Cada capítulo tem `chapterLength` ondas. */
export const CAMPAIGN = {
  levels: 20,
  chapterLength: 5,
} as const;

/** Dash do piloto automático: arrancadas curtas e aleatórias que quebram a órbita constante. */
export const DASH = {
  minIntervalMs: 1_800,
  maxIntervalMs: 3_200,
  durationMs: 260,
  multiplier: 2.6,
} as const;

/** Fator de velocidade de toda a partida. Maior = ondas, movimento e efeitos mais rápidos. */
export const SPEED = {
  timeScale: 1.5,
} as const;

export const PROJECTILE = {
  radius: 5,
  speed: 620,
  /** Distância além da qual o projétil é descartado. */
  maxTravel: 900,
} as const;

export const LIVE_EFFECTS = {
  /** Curtidas acumuladas necessárias para curar `likeHealAmount` (40 curtidas = 2 de vida). */
  likesPerHeal: 40,
  likeHealAmount: 2,
  commentScore: 5,
  /** Multiplicador de cadência de ataque durante o turbo. */
  boostAttackSpeedMultiplier: 2,
} as const;

export const WAVES = {
  intermissionMs: 1_000,
  maxEnemiesPerWave: 60,
  minSpawnIntervalMs: 200,
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

/**
 * Efeitos de presentes (turbo, escudo e fúria) somam o tempo de cada presente.
 * Este é o teto do tempo acumulado, para um efeito não durar para sempre.
 */
export const EFFECT_CAP_MS = 120_000;

/**
 * Fúria (presentes de 100 e 500): imunidade, tiro rápido e dano que mata qualquer inimigo
 * de um golpe, inclusive chefes. O personagem também anda mais rápido.
 */
export const BERSERK = {
  attackCooldownMs: 60,
  hitKillDamage: 9_999,
  moveMultiplier: 1.6,
} as const;

/** Reinício automático da partida após a derrota. */
export const RUN = {
  restartDelayMs: 6_000,
} as const;

/**
 * Tipos de inimigo comum. Cada capítulo (5 ondas) traz um tipo diferente:
 * virus (ondas 1-5), atirador (6-10), saltador (11-15) e ouriço (16-20).
 * Os fatores multiplicam a vida e a velocidade da onda.
 */
export const ENEMY_TYPES = {
  shooter: {
    hpFactor: 0.8,
    speedFactor: 0.75,
    radius: 16,
    contactDamage: 6,
    /** Distância que o atirador tenta manter do personagem. */
    preferredDistance: 240,
    tooCloseDistance: 170,
    fireRangeDistance: 480,
    fireIntervalMs: 2_400,
    /** Limite de atiradores por onda: em grupo, a chuva de tiros fica injusta. */
    maxPerWave: 14,
    shotDamage: 5,
    shotSpeed: 240,
  },
  charger: {
    hpFactor: 0.7,
    speedFactor: 0.7,
    radius: 16,
    contactDamage: 6,
    /** Limite de saltadores por onda: em grupo, as arrancadas se somam e a fuga fica impossível. */
    maxPerWave: 16,
    /** Tempo de aproximação lenta antes de cada arrancada. */
    approachMs: 3_000,
    approachSpeedFactor: 0.8,
    chargeMs: 500,
    chargeSpeedFactor: 2.2,
  },
  tank: {
    hpFactor: 2.2,
    speedFactor: 0.6,
    radius: 22,
    contactDamage: 12,
    maxPerWave: 24,
  },
} as const;

/** Tiros disparados por inimigos e chefes. */
export const SHOT = {
  radius: 7,
  /** Distância além da qual o tiro inimigo some. */
  maxTravel: 1_000,
} as const;
