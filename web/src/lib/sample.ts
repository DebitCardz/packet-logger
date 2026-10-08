import type { Database, SqlJsStatic } from 'sql.js'
import type { SampleVariant } from './types'

/** [packet name, outgoing, packets per second per player, average size in bytes] */
const PROFILES: [string, boolean, number, number][] = [
  ['ENTITY_RELATIVE_MOVE', true, 38, 14],
  ['ENTITY_HEAD_LOOK', true, 22, 7],
  ['ENTITY_RELATIVE_MOVE_AND_ROTATION', true, 18, 16],
  ['ENTITY_VELOCITY', true, 9, 12],
  ['ENTITY_METADATA', true, 6, 28],
  ['CHUNK_DATA', true, 0.6, 9200],
  ['UNLOAD_CHUNK', true, 0.5, 10],
  ['UPDATE_LIGHT', true, 0.4, 1800],
  ['BLOCK_CHANGE', true, 2.5, 12],
  ['MULTI_BLOCK_CHANGE', true, 0.8, 64],
  ['SPAWN_ENTITY', true, 1.2, 52],
  ['DESTROY_ENTITIES', true, 1.1, 8],
  ['ENTITY_TELEPORT', true, 1.5, 36],
  ['SOUND_EFFECT', true, 1.8, 34],
  ['PARTICLE', true, 1.3, 48],
  ['TIME_UPDATE', true, 0.05, 18],
  ['KEEP_ALIVE', true, 0.067, 9],
  ['PLAYER_INFO_UPDATE', true, 0.2, 120],
  ['SYSTEM_CHAT_MESSAGE', true, 0.3, 140],
  ['UPDATE_ATTRIBUTES', true, 0.4, 60],
  ['ENTITY_EQUIPMENT', true, 0.5, 40],
  ['PLAYER_POSITION', false, 12, 26],
  ['PLAYER_POSITION_AND_ROTATION', false, 6, 34],
  ['PLAYER_ROTATION', false, 4, 10],
  ['PLAYER_FLYING', false, 1.5, 2],
  ['ANIMATION', false, 1.2, 2],
  ['ENTITY_ACTION', false, 0.6, 6],
  ['PLAYER_DIGGING', false, 0.4, 14],
  ['PLAYER_BLOCK_PLACEMENT', false, 0.3, 18],
  ['HELD_ITEM_CHANGE', false, 0.2, 3],
  ['KEEP_ALIVE', false, 0.067, 9],
  ['CHAT_MESSAGE', false, 0.02, 90],
  ['CLIENT_TICK_END', false, 20, 1],
]

const FLUSH_SECONDS = 5

/**
 * The "after" sample pretends the server lowered its entity tracking range and view distance,
 * turned particles off, and started bundling packets.
 */
const VARIANTS: Record<SampleVariant, { hours: number; seed: number; scale: (name: string) => number; extra: typeof PROFILES }> = {
  before: { hours: 3, seed: 42, scale: () => 1, extra: [] },
  after: {
    hours: 2,
    seed: 7,
    scale: (name) => {
      if (name === 'PARTICLE') return 0
      if (name.startsWith('ENTITY_') || name === 'SPAWN_ENTITY' || name === 'DESTROY_ENTITIES') return 0.55
      if (name === 'CHUNK_DATA' || name === 'UPDATE_LIGHT' || name === 'UNLOAD_CHUNK') return 0.6
      return 1
    },
    extra: [['BUNDLE', true, 0.8, 1]],
  },
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Builds an in-memory database with the plugin's schema and a few hours of plausible traffic. */
export function createSampleDatabase(SQL: SqlJsStatic, variant: SampleVariant): Database {
  const { hours, seed, scale, extra } = VARIANTS[variant]
  const profiles = [...PROFILES, ...extra]
    .map(([name, outgoing, rate, size]) => [name, outgoing, rate * scale(name), size] as const)
    .filter(([, , rate]) => rate > 0)
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE batched_packets (id INTEGER PRIMARY KEY AUTOINCREMENT, packet_name TEXT NOT NULL,
      amount INTEGER NOT NULL, size_bytes INTEGER NOT NULL, collected_at INTEGER NOT NULL);
    CREATE TABLE packet_bound (id INTEGER PRIMARY KEY AUTOINCREMENT, packet_name TEXT NOT NULL,
      outgoing INTEGER NOT NULL);
  `)

  // PacketEvents names some packets identically on both sides; the plugin keeps the first one seen.
  const seen = new Set<string>()
  const bound = db.prepare('INSERT INTO packet_bound (packet_name, outgoing) VALUES (?, ?)')
  for (const [name, outgoing] of profiles) {
    if (seen.has(name)) continue
    seen.add(name)
    bound.run([name, outgoing ? 1 : 0])
  }
  bound.free()

  const random = mulberry32(seed)
  const steps = (hours * 3600) / FLUSH_SECONDS
  const end = Math.floor(Date.now() / 60_000) * 60_000
  const start = end - steps * FLUSH_SECONDS * 1000

  const insert = db.prepare(
    'INSERT INTO batched_packets (packet_name, amount, size_bytes, collected_at) VALUES (?, ?, ?, ?)',
  )
  db.run('BEGIN')
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps
    // Players ramp up, peak around two thirds of the way in, with an event spike.
    const players =
      6 + 30 * Math.sin(Math.PI * Math.min(progress * 1.2, 1)) ** 2 +
      (progress > 0.55 && progress < 0.6 ? 18 : 0)
    const at = start + step * FLUSH_SECONDS * 1000

    for (const [name, , rate, size] of profiles) {
      const jitter = 0.7 + random() * 0.6
      const amount = Math.round(rate * players * FLUSH_SECONDS * jitter)
      if (amount === 0) continue
      const bytes = Math.round(amount * size * (0.8 + random() * 0.4))
      insert.run([name, amount, bytes, at])
    }
  }
  db.run('COMMIT')
  insert.free()

  return db
}
