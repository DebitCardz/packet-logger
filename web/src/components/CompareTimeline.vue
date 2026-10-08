<script setup lang="ts">
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import '../lib/chart'
import { formatBytes, formatCount, formatElapsed, formatRate } from '../lib/format'
import { tooltipStyle } from '../lib/tooltip'
import type { Metric, PacketTotal, TimeSeries } from '../lib/types'
import { useThemeColors } from '../composables/useThemeColors'

const props = defineProps<{
  before: TimeSeries
  after: TimeSeries
  /** Packet names that pass the direction filter on each side. */
  beforePackets: PacketTotal[]
  afterPackets: PacketTotal[]
  metric: Metric
}>()

const colors = useThemeColors()

/** Sum the visible packets per bucket and turn it into a per second rate. */
function rates(series: TimeSeries, packets: PacketTotal[]): number[] {
  const out = new Array<number>(series.buckets.length).fill(0)
  const values = series[props.metric]
  for (const { name } of packets) values[name]?.forEach((v, i) => (out[i]! += v))
  return out.map((v) => v / (series.bucketMs / 1000))
}

const data = computed<ChartData<'line'>>(() => {
  const c = colors.value
  const b = rates(props.before, props.beforePackets)
  const a = rates(props.after, props.afterPackets)
  const length = Math.max(b.length, a.length)
  const bucketMs = props.before.bucketMs
  const line = (label: string, values: number[], color: string, dashed: boolean) => ({
    label,
    data: values,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    borderDash: dashed ? [5, 4] : [],
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHoverBorderColor: c.surface,
    pointHoverBorderWidth: 2,
    tension: 0.25,
    spanGaps: false,
  })
  return {
    labels: Array.from({ length }, (_, i) => formatElapsed(i * bucketMs, bucketMs < 60_000)),
    datasets: [line('Before', b, c.before, true), line('After', a, c.orange, false)],
  }
})

const options = computed<ChartOptions<'line'>>(() => {
  const c = colors.value
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        grid: { display: false },
        border: { color: c.border },
        ticks: { color: c.textMuted, maxRotation: 0, autoSkipPadding: 24 },
        title: {
          display: true,
          text: `time since recording started (${props.before.bucketMs < 60_000 ? 'm:ss' : 'h:mm'})`,
          color: c.textMuted,
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: c.grid },
        border: { display: false },
        ticks: {
          color: c.textMuted,
          maxTicksLimit: 6,
          callback: (v) => (props.metric === 'amount' ? `${formatCount(Number(v))}/s` : `${formatBytes(Number(v), 0)}/s`),
        },
      },
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { color: c.textSecondary, boxWidth: 18, boxHeight: 2, padding: 12 },
      },
      tooltip: {
        ...tooltipStyle(c),
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => `+${items[0]?.label ?? ''}`,
          label: (item: TooltipItem<'line'>) => ` ${item.dataset.label}: ${formatRate(item.parsed.y ?? 0, props.metric)}`,
        },
      },
    },
  }
})
</script>

<template>
  <Line :data="data" :options="options" />
</template>
