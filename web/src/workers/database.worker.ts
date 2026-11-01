/// <reference lib="webworker" />
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type {
  Capture,
  DatasetKey,
  Direction,
  LoadedFile,
  PacketTotal,
  SkippedFile,
  Summary,
  TimeSeries,
  TimeWindow,
  WorkerRequest,
  WorkerResponse,
} from '../lib/types'
import { createSampleDatabase } from '../lib/sample'

/** Refuse to fill more buckets than this; the UI never asks for more. */
const MAX_BUCKETS = 5000

let sqlPromise: Promise<SqlJsStatic> | undefined
type Loaded = { file: LoadedFile; db: Database }
const datasets: Record<DatasetKey, Loaded[]> = { main: [], before: [], after: [], capture: [] }

function sql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl })
  return sqlPromise
}

function hasTable(db: Database, table: string): boolean {
  const res = db.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table])
  return res.length > 0
}

/** The table a view reads and how to explain a file that doesn't have what it needs. */
const PACKET_DATA = {
  table: 'batched_packets',
  time: 'collected_at',
  missing: 'no batched_packets table, is this a packet-logger file?',
  empty: 'the file has no packet data yet',
}
const REQUIREMENTS: Record<DatasetKey, typeof PACKET_DATA> = {
  main: PACKET_DATA,
  before: PACKET_DATA,
  after: PACKET_DATA,
  capture: {
    table: 'captured_packets',
    time: 'captured_at',
    missing: 'no captures in this file, run /packetlogger capture on the server first',
    empty: 'the capture table in this file is empty',
  },
}

function open(SQL: SqlJsStatic, name: string, buffer: ArrayBuffer, dataset: DatasetKey): Loaded {
  let db: Database
  try {
    db = new SQL.Database(new Uint8Array(buffer))
    // Force SQLite to read the header so non-database files fail here.
    db.exec('SELECT count(*) FROM sqlite_master')
  } catch {
    throw new Error('not a SQLite database')
  }

  const required = REQUIREMENTS[dataset]
  if (!hasTable(db, required.table)) {
    db.close()
    throw new Error(required.missing)
  }

  const [row] = db.exec(
    `SELECT COUNT(*), MIN(${required.time}), MAX(${required.time}) FROM ${required.table}`,
  )[0]?.values ?? []
  const [rows, start, end] = (row ?? [0, null, null]) as [number, number | null, number | null]
  if (!rows || start == null || end == null) {
    db.close()
    throw new Error(required.empty)
  }

  return { file: { name, sizeBytes: buffer.byteLength, rows, start, end }, db }
}

/** SQL condition and parameters limiting rows to a timeframe. */
function windowFilter(window: TimeWindow | null, column: string): { where: string; params: Record<string, number> } {
  return window
    ? { where: `WHERE ${column} >= $start AND ${column} < $end`, params: { $start: window.start, $end: window.end } }
    : { where: '', params: {} }
}

function totals(dataset: DatasetKey, window: TimeWindow | null): PacketTotal[] {
  const totals = new Map<string, PacketTotal>()
  const filter = windowFilter(window, 'b.collected_at')

  for (const { db } of datasets[dataset]) {
    // Files opened only for their captures have no counts to add.
    if (!hasTable(db, 'batched_packets')) continue
    // packet_bound has one row per packet type per session; MAX() guards against duplicates.
    const boundJoin = hasTable(db, 'packet_bound')
      ? `LEFT JOIN (SELECT packet_name, MAX(outgoing) AS outgoing FROM packet_bound GROUP BY packet_name) pb
           ON pb.packet_name = b.packet_name`
      : 'LEFT JOIN (SELECT NULL AS packet_name, NULL AS outgoing) pb ON 0'
    const result = db.exec(`
      SELECT b.packet_name, pb.outgoing, SUM(b.amount), SUM(b.size_bytes)
      FROM batched_packets b
      ${boundJoin}
      ${filter.where}
      GROUP BY b.packet_name
    `, filter.params)[0]

    for (const [name, outgoing, amount, bytes] of result?.values ?? []) {
      const key = String(name)
      const direction: Direction = outgoing == null ? 'unknown' : Number(outgoing) ? 'out' : 'in'
      const existing = totals.get(key)
      if (existing) {
        existing.amount += Number(amount)
        existing.bytes += Number(bytes)
        if (existing.direction === 'unknown') existing.direction = direction
      } else {
        totals.set(key, { name: key, direction, amount: Number(amount), bytes: Number(bytes) })
      }
    }
  }

  return [...totals.values()]
}

function summarize(dataset: DatasetKey, skipped: SkippedFile[]): Summary {
  return { files: datasets[dataset].map((d) => d.file), skipped, packets: totals(dataset, null) }
}

function series(dataset: DatasetKey, bucketMs: number, window: TimeWindow | null): TimeSeries {
  const loaded = datasets[dataset]
  if (!loaded.length) throw new Error('no files loaded')
  const start = window?.start ?? Math.min(...loaded.map((d) => d.file.start))
  // Windows are end exclusive; the last flush of a file is inclusive.
  const end = window ? window.end - 1 : Math.max(...loaded.map((d) => d.file.end))
  const filter = windowFilter(window, 'collected_at')
  const first = Math.floor(start / bucketMs) * bucketMs
  const count = Math.floor(end / bucketMs) - Math.floor(start / bucketMs) + 1
  if (count > MAX_BUCKETS) throw new Error(`too many buckets (${count})`)

  const buckets = Array.from({ length: count }, (_, i) => first + i * bucketMs)
  const amount: Record<string, number[]> = {}
  const bytes: Record<string, number[]> = {}

  for (const { db } of loaded) {
    const stmt = db.prepare(`
      SELECT packet_name, (collected_at / $bucket) * $bucket AS t, SUM(amount), SUM(size_bytes)
      FROM batched_packets
      ${filter.where}
      GROUP BY packet_name, t
    `)
    stmt.bind({ $bucket: bucketMs, ...filter.params })
    while (stmt.step()) {
      const [name, t, a, b] = stmt.get() as [string, number, number, number]
      const index = (t - first) / bucketMs
      const amounts = (amount[name] ??= new Array<number>(count).fill(0))
      const sizes = (bytes[name] ??= new Array<number>(count).fill(0))
      amounts[index]! += a
      sizes[index]! += b
    }
    stmt.free()
  }

  return { bucketMs, buckets, amount, bytes }
}

/** Every capture in the loaded files, newest first. */
function captures(dataset: DatasetKey): Capture[] {
  const result: Capture[] = []
  for (const { file, db } of datasets[dataset]) {
    if (!hasTable(db, 'captured_packets')) continue
    const stmt = db.prepare(`
      SELECT capture_id, player_uuid, player_name, id, packet_name, outgoing, size_bytes, captured_at, data
      FROM captured_packets
      ORDER BY capture_id, captured_at, id
    `)
    let current: Capture | undefined
    while (stmt.step()) {
      const [captureId, uuid, player, id, name, outgoing, size, at, data] =
        stmt.get() as [number, string, string, number, string, number, number, number, string]
      const key = `${file.name}:${captureId}`
      if (current?.key !== key) {
        current = { key, file: file.name, player, playerUuid: uuid, start: at, end: at, packets: [] }
        result.push(current)
      }
      current.packets.push({ id, name, direction: outgoing ? 'out' : 'in', sizeBytes: size, at, data })
      current.end = at
    }
    stmt.free()
  }
  return result.sort((a, b) => b.start - a.start)
}

function reset(dataset: DatasetKey) {
  for (const { db } of datasets[dataset].splice(0)) db.close()
}

async function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.type) {
    case 'load': {
      const SQL = await sql()
      const skipped: SkippedFile[] = []
      const opened: Loaded[] = []
      for (const { name, buffer } of request.files) {
        try {
          opened.push(open(SQL, name, buffer, request.dataset))
        } catch (err) {
          skipped.push({ name, reason: err instanceof Error ? err.message : String(err) })
        }
      }
      // A replace only drops the old files once something new loaded, so a bad drop keeps the old data.
      if (request.replace && opened.length) reset(request.dataset)
      datasets[request.dataset].push(...opened)
      return { ...summarize(request.dataset, skipped), added: opened.length }
    }
    case 'sample': {
      const SQL = await sql()
      reset(request.dataset)
      const db = createSampleDatabase(SQL, request.variant)
      const buffer = db.export().buffer as ArrayBuffer
      db.close()
      datasets[request.dataset].push(open(SQL, `sample-${request.variant}.sqlite`, buffer, request.dataset))
      return { ...summarize(request.dataset, []), added: 1 }
    }
    case 'series':
      return series(request.dataset, request.bucketMs, request.window)
    case 'totals':
      return totals(request.dataset, request.window)
    case 'captures':
      return captures(request.dataset)
    case 'reset':
      reset(request.dataset)
      return null
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data
  let response: WorkerResponse
  try {
    response = { id, ok: true, result: await handle(event.data) }
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(response)
}
