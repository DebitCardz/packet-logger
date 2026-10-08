import { computed, ref, shallowRef, watch } from 'vue'
import type { DirectionFilter, Metric, PacketTotal, TimeSeries, TimeWindow } from '../lib/types'
import { useDataset } from './useDataset'

export const BUCKET_OPTIONS = [
  { ms: 5_000, label: '5 seconds' },
  { ms: 15_000, label: '15 seconds' },
  { ms: 30_000, label: '30 seconds' },
  { ms: 60_000, label: 'Minute' },
  { ms: 300_000, label: '5 minutes' },
  { ms: 900_000, label: '15 minutes' },
  { ms: 1_800_000, label: '30 minutes' },
  { ms: 3_600_000, label: 'Hour' },
  { ms: 21_600_000, label: '6 hours' },
  { ms: 86_400_000, label: 'Day' },
] as const

/** Bars beyond this get too thin to read or hover. */
const MAX_VISIBLE_BUCKETS = 720
const TARGET_BUCKETS = 120
/** Packet types that get their own colour; the rest fold into "Other". */
export const TOP_SERIES = 8

export const metricValue = (packet: PacketTotal, metric: Metric) =>
  metric === 'amount' ? packet.amount : packet.bytes

export const filterDirection = (packets: PacketTotal[], direction: DirectionFilter) =>
  direction === 'all' ? packets : packets.filter((p) => p.direction === direction)

export function bucketOptionsFor(spanMs: number) {
  const options = BUCKET_OPTIONS.filter((o) => spanMs / o.ms <= MAX_VISIBLE_BUCKETS || o.ms === 86_400_000)
  // Zoomed in to less than a day: grouping by day or 6 hours would be a single bar.
  return options.filter((o, i) => i === 0 || o.ms <= Math.max(spanMs, options[0]!.ms))
}

export function defaultBucket(spanMs: number): number {
  const options = bucketOptionsFor(spanMs)
  return (options.find((o) => spanMs / o.ms <= TARGET_BUCKETS) ?? options.at(-1)!).ms
}

/** State for the single-dataset report page. */
export function usePacketLog() {
  const data = useDataset('main')
  const { summary, range } = data

  const series = shallowRef<TimeSeries | null>(null)
  /** Totals for the zoomed timeframe; null means the whole recording. */
  const windowTotals = shallowRef<PacketTotal[] | null>(null)
  const refreshing = ref(false)

  const direction = ref<DirectionFilter>('all')
  const metric = ref<Metric>('amount')
  const bucketMs = ref<number>(60_000)
  const selected = ref<string[]>([])
  const timeWindow = ref<TimeWindow | null>(null)

  const span = computed(() => {
    if (timeWindow.value) return timeWindow.value.end - timeWindow.value.start
    return range.value ? range.value.end - range.value.start : 0
  })
  const bucketOptions = computed(() => bucketOptionsFor(span.value))

  /** Recorded time inside the current view, skipping gaps between sessions. */
  const recordedMs = computed(() => {
    const files = summary.value?.files ?? []
    const w = timeWindow.value
    if (!w) return range.value?.recordedMs ?? 0
    return files.reduce((sum, f) => sum + Math.max(0, Math.min(f.end, w.end) - Math.max(f.start, w.start)), 0)
  })
  const seconds = computed(() => Math.max(recordedMs.value / 1000, 1))

  /** Every packet in the current timeframe, whatever the direction filter. */
  const packetsAllDirections = computed(() => windowTotals.value ?? summary.value?.packets ?? [])

  const packets = computed(() =>
    [...filterDirection(packetsAllDirections.value, direction.value)].sort(
      (a, b) => metricValue(b, metric.value) - metricValue(a, metric.value),
    ),
  )

  const topNames = computed(() => packets.value.slice(0, TOP_SERIES).map((p) => p.name))

  /**
   * Colour slot per packet. Normally the top packets own the slots; while packets are selected,
   * only they are coloured, keeping their usual slot when they have one.
   */
  const slots = computed(() => {
    const map = new Map<string, number>()
    if (!selected.value.length) {
      topNames.value.forEach((name, i) => map.set(name, i))
      return map
    }
    const ordered = packets.value.filter((p) => selected.value.includes(p.name)).map((p) => p.name)
    for (const name of ordered) {
      const slot = topNames.value.indexOf(name)
      if (slot !== -1) map.set(name, slot)
    }
    let next = 0
    for (const name of ordered) {
      if (map.has(name)) continue
      while ([...map.values()].includes(next)) next++
      if (next >= TOP_SERIES) break
      map.set(name, next)
    }
    return map
  })

  // Responses can arrive out of order when filters change quickly; only the latest of each counts.
  let seriesToken = 0
  let totalsToken = 0
  async function refreshSeries() {
    const token = ++seriesToken
    refreshing.value = true
    try {
      const next = await data.series(bucketMs.value, timeWindow.value)
      if (token === seriesToken) series.value = next
    } finally {
      if (token === seriesToken) refreshing.value = false
    }
  }
  async function refreshTotals() {
    const token = ++totalsToken
    const next = timeWindow.value ? await data.totals(timeWindow.value) : null
    if (token === totalsToken) windowTotals.value = next
  }

  /** Re-pick the grouping for the current view, then reload everything for it. */
  let picking = false
  async function reload() {
    picking = true
    bucketMs.value = defaultBucket(span.value)
    picking = false
    await Promise.all([refreshSeries(), refreshTotals()])
  }

  async function afterLoad(loaded: boolean) {
    if (!loaded) return
    selected.value = []
    timeWindow.value = null
    await reload()
  }

  // Sync so that reload() changing the grouping doesn't trigger a second fetch.
  watch(
    bucketMs,
    () => {
      if (!picking && series.value) void refreshSeries()
    },
    { flush: 'sync' },
  )

  // Selected packets that the direction filter hides would leave holes in the chart.
  watch(packets, (list) => {
    const visible = new Set(list.map((p) => p.name))
    if (selected.value.some((name) => !visible.has(name))) {
      selected.value = selected.value.filter((name) => visible.has(name))
    }
  })

  return {
    ...data,
    seconds,
    recordedMs,
    series,
    refreshing,
    direction,
    metric,
    bucketMs,
    bucketOptions,
    selected,
    timeWindow,
    packetsAllDirections,
    packets,
    topNames,
    slots,
    /** Plain click picks one packet (or clears it); shift/ctrl click adds or removes. */
    select(name: string, additive: boolean) {
      const has = selected.value.includes(name)
      if (additive) selected.value = has ? selected.value.filter((n) => n !== name) : [...selected.value, name]
      else selected.value = has && selected.value.length === 1 ? [] : [name]
    },
    clearSelection: () => (selected.value = []),
    async zoom(window: TimeWindow | null) {
      timeWindow.value = window
      await reload()
    },
    addFiles: async (files: File[]) => afterLoad(await data.addFiles(files)),
    async reset() {
      await data.reset()
      series.value = null
      windowTotals.value = null
      timeWindow.value = null
      direction.value = 'all'
      metric.value = 'amount'
      selected.value = []
    },
  }
}

export type PacketLog = ReturnType<typeof usePacketLog>
