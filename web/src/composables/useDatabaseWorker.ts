import type { DatasetKey, LoadResult, PacketTotal, SampleVariant, TimeSeries, TimeWindow, WorkerRequest, WorkerResponse } from '../lib/types'
import DatabaseWorker from '../workers/database.worker?worker'

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void }

let worker: Worker | undefined
let nextId = 0
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new DatabaseWorker()
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    if (data.ok) entry.resolve(data.result)
    else entry.reject(new Error(data.error))
  }
  return worker
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

function call<T>(request: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[] = []): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    getWorker().postMessage({ ...request, id }, transfer)
  })
}

/** Vue's reactive proxies can't be structured-cloned into a worker. */
const plain = (window: TimeWindow | null): TimeWindow | null => (window ? { start: window.start, end: window.end } : null)

/** SQLite runs in a worker so large files don't freeze the page. */
export function useDatabaseWorker(dataset: DatasetKey) {
  return {
    async load(files: File[], replace = false): Promise<LoadResult> {
      const payload = await Promise.all(
        files.map(async (file) => ({ name: file.name, buffer: await file.arrayBuffer() })),
      )
      return call<LoadResult>({ type: 'load', dataset, replace, files: payload }, payload.map((f) => f.buffer))
    },
    sample: (variant: SampleVariant) => call<LoadResult>({ type: 'sample', dataset, variant }),
    series: (bucketMs: number, window: TimeWindow | null = null) =>
      call<TimeSeries>({ type: 'series', dataset, bucketMs, window: plain(window) }),
    totals: (window: TimeWindow | null) => call<PacketTotal[]>({ type: 'totals', dataset, window: plain(window) }),
    reset: () => call<null>({ type: 'reset', dataset }),
  }
}
