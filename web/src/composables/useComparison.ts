import { computed, ref, shallowRef, watch } from 'vue'
import type { Direction, DirectionFilter, Metric, PacketTotal, TimeSeries } from '../lib/types'
import { useDataset, type Dataset } from './useDataset'
import { bucketOptionsFor, defaultBucket, filterDirection, metricValue } from './usePacketLog'

/** Changes smaller than this are treated as noise and shown neutral. */
export const NOISE = 0.01

export interface SideTotals {
  /** Per second of recording. */
  amountRate: number
  bytesRate: number
  avgSize: number
  types: number
}

export interface DiffRow {
  name: string
  direction: Direction
  /** Rates per second for the selected measure. */
  before: number
  after: number
  delta: number
  /** Relative change, null when the packet only exists in the "after" file. */
  change: number | null
  status: 'new' | 'gone' | 'changed'
}

function totalsFor(packets: PacketTotal[], seconds: number): SideTotals {
  const amount = packets.reduce((sum, p) => sum + p.amount, 0)
  const bytes = packets.reduce((sum, p) => sum + p.bytes, 0)
  return { amountRate: amount / seconds, bytesRate: bytes / seconds, avgSize: amount ? bytes / amount : 0, types: packets.length }
}

/** State for the before vs after page. Rates are per second so recordings of different length line up. */
export function useComparison() {
  const before = useDataset('before')
  const after = useDataset('after')

  const direction = ref<DirectionFilter>('all')
  const metric = ref<Metric>('amount')
  const bucketMs = ref(60_000)
  const beforeSeries = shallowRef<TimeSeries | null>(null)
  const afterSeries = shallowRef<TimeSeries | null>(null)

  const ready = computed(() => !!before.summary.value && !!after.summary.value)
  const loading = computed(() => before.loading.value || after.loading.value)

  const span = computed(() => {
    const spans = [before.range.value, after.range.value].map((r) => (r ? r.end - r.start : 0))
    return Math.max(...spans)
  })
  const bucketOptions = computed(() => bucketOptionsFor(span.value))

  const filtered = (side: Dataset) => filterDirection(side.summary.value?.packets ?? [], direction.value)

  const totals = computed(() => ({
    before: totalsFor(filtered(before), before.seconds.value),
    after: totalsFor(filtered(after), after.seconds.value),
  }))

  const rows = computed<DiffRow[]>(() => {
    const byName = new Map<string, DiffRow>()
    const add = (side: 'before' | 'after', packets: PacketTotal[], seconds: number) => {
      for (const p of packets) {
        const row = byName.get(p.name) ?? {
          name: p.name, direction: p.direction, before: 0, after: 0, delta: 0, change: null, status: 'changed' as const,
        }
        row[side] = metricValue(p, metric.value) / seconds
        if (row.direction === 'unknown') row.direction = p.direction
        byName.set(p.name, row)
      }
    }
    add('before', filtered(before), before.seconds.value)
    add('after', filtered(after), after.seconds.value)

    return [...byName.values()]
      .map((row) => ({
        ...row,
        delta: row.after - row.before,
        change: row.before ? (row.after - row.before) / row.before : null,
        status: !row.before ? ('new' as const) : !row.after ? ('gone' as const) : ('changed' as const),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  })

  async function refreshSeries() {
    if (!ready.value) return
    const [b, a] = await Promise.all([before.series(bucketMs.value), after.series(bucketMs.value)])
    beforeSeries.value = b
    afterSeries.value = a
  }

  // Pick a fresh grouping whenever either side's files change, then load both timelines.
  watch([before.summary, after.summary], () => {
    beforeSeries.value = null
    afterSeries.value = null
    if (!ready.value) return
    const next = defaultBucket(span.value)
    if (next === bucketMs.value) void refreshSeries()
    else bucketMs.value = next
  })
  watch(bucketMs, () => void refreshSeries())

  return {
    before,
    after,
    direction,
    metric,
    bucketMs,
    bucketOptions,
    beforeSeries,
    afterSeries,
    ready,
    loading,
    totals,
    rows,
    async loadSamples() {
      await Promise.all([before.loadSample('before'), after.loadSample('after')])
    },
    async reset() {
      await Promise.all([before.reset(), after.reset()])
      direction.value = 'all'
      metric.value = 'amount'
    },
  }
}

export type Comparison = ReturnType<typeof useComparison>
