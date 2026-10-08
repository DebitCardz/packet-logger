export type Direction = 'in' | 'out' | 'unknown'
export type DirectionFilter = 'all' | 'in' | 'out'
export type Metric = 'amount' | 'bytes'

export interface LoadedFile {
  name: string
  sizeBytes: number
  rows: number
  /** First flush timestamp (epoch ms). */
  start: number
  /** Last flush timestamp (epoch ms). */
  end: number
}

export interface SkippedFile {
  name: string
  reason: string
}

export interface PacketTotal {
  name: string
  direction: Direction
  amount: number
  bytes: number
}

export interface Summary {
  files: LoadedFile[]
  skipped: SkippedFile[]
  packets: PacketTotal[]
}

export interface LoadResult extends Summary {
  /** How many files this request added; 0 means every file was rejected. */
  added: number
}

export interface TimeSeries {
  bucketMs: number
  /** Bucket start timestamps (epoch ms), contiguous from first to last bucket. */
  buckets: number[]
  /** Per packet name, values aligned with `buckets`. */
  amount: Record<string, number[]>
  bytes: Record<string, number[]>
}

/** Each view loads into its own set of databases. */
export type DatasetKey = 'main' | 'before' | 'after'
export type SampleVariant = 'before' | 'after'

/** A timeframe in epoch ms, end exclusive. */
export interface TimeWindow {
  start: number
  end: number
}

export type WorkerRequest =
  | { id: number; type: 'load'; dataset: DatasetKey; replace: boolean; files: { name: string; buffer: ArrayBuffer }[] }
  | { id: number; type: 'sample'; dataset: DatasetKey; variant: SampleVariant }
  | { id: number; type: 'series'; dataset: DatasetKey; bucketMs: number; window: TimeWindow | null }
  | { id: number; type: 'totals'; dataset: DatasetKey; window: TimeWindow | null }
  | { id: number; type: 'reset'; dataset: DatasetKey }

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
