export const PALETTE = {
  bg:      '#0D0F1A',
  card:    '#161B2E',
  card2:   '#1E2640',
  border:  '#2A3352',
  gold:    '#F0B90B',
  white:   '#FFFFFF',
  muted:   '#6B7A99',
  p1: '#F0B90B',
  p2: '#3DD6C8',
  p3: '#A78BFA',
  p4: '#60A5FA',
  p5: '#34D399',
  p6: '#F87171',
}

export const MSG_COLORS: Record<string, string> = {
  GREETING:            '#60A5FA',
  TASK_REQUEST:        '#A78BFA',
  TASK_RESPONSE:       '#34D399',
  SKILL_SIGNAL:        '#F0B90B',
  REPUTATION_ENDORSE:  '#F87171',
  TERRITORY_INVITE:    '#3DD6C8',
  DATA_EXCHANGE:       '#E879F9',
  AIRDROP_ANNOUNCE:    '#F0B90B',
}

export const MSG_LABELS: Record<string, string> = {
  GREETING:            'GREET',
  TASK_REQUEST:        'TASK',
  TASK_RESPONSE:       'DONE',
  SKILL_SIGNAL:        'SKILL',
  REPUTATION_ENDORSE:  'ENDORSE',
  TERRITORY_INVITE:    'INVITE',
  DATA_EXCHANGE:       'DATA',
  AIRDROP_ANNOUNCE:    'AIRDROP',
}

/** Convert #RRGGBB → 0xRRGGBB (Phaser hex) */
export function toPhaserColor(hex: string): number {
  return parseInt(hex.replace('#', '0x'), 16)
}

/** Hex + alpha → CSS rgba */
export function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
