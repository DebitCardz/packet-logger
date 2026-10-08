<script setup lang="ts">
import type { Chart, ChartData, ChartOptions, TooltipItem } from 'chart.js'
import { computed, ref, useTemplateRef } from 'vue'
import { Bar } from 'vue-chartjs'
import '../lib/chart'
import { colorFor } from '../lib/colors'
import { formatBucketLabel, formatBytes, formatCount, formatExactCount } from '../lib/format'
import { tooltipStyle } from '../lib/tooltip'
import type { Metric, PacketTotal, TimeSeries, TimeWindow } from '../lib/types'
import { useThemeColors } from '../composables/useThemeColors'

const props = defineProps<{
  series: TimeSeries
  packets: PacketTotal[]
  topNames: string[]
  slots: Map<string, number>
  selected: string[]
  metric: Metric
  spansDays: boolean
}>()
const emit = defineEmits<{ zoom: [window: TimeWindow] }>()

const colors = useThemeColors()

// Drag across the chart to zoom into that timeframe.
const chartRef = useTemplateRef<{ chart: Chart<'bar'> | null }>('chart')
const brush = ref<{ from: number; to: number } | null>(null)
/** Only flips at the start and end of a drag, so the chart isn't rebuilt on every mouse move. */
const brushing = computed(() => brush.value !== null)
let pointerId: number | null = null

const formatValue = (value: number) => (props.metric === 'amount' ? formatExactCount(value) : formatBytes(value, 2))

const data = computed<ChartData<'bar'>>(() => {
  const { series, metric, packets, topNames, slots, selected } = props
  const values = series[metric]
  const zeros = () => new Array<number>(series.buckets.length).fill(0)
  const dataset = (label: string, data: number[], color: string) => ({
    label,
    data,
    backgroundColor: color,
    hoverBackgroundColor: color,
    borderColor: colors.value.surface,
    borderWidth: { top: series.buckets.length > 240 ? 0 : 1 },
    borderSkipped: false as const,
    categoryPercentage: 0.9,
    barPercentage: 1,
  })

  // Selected packets replace the default "top N + Other" view.
  const shown = selected.length ? packets.filter((p) => selected.includes(p.name)).map((p) => p.name) : topNames
  const datasets = shown.map((name) => dataset(name, values[name] ?? zeros(), colorFor(name, slots, colors.value)))
  if (!selected.length) {
    const rest = packets.slice(topNames.length)
    if (rest.length) {
      const other = zeros()
      for (const { name } of rest) values[name]?.forEach((v, i) => (other[i]! += v))
      datasets.push(dataset(`Other (${rest.length} types)`, other, colors.value.other))
    }
  }

  return {
    labels: series.buckets.map((t) => formatBucketLabel(t, series.bucketMs, props.spansDays)),
    datasets,
  }
})

const options = computed<ChartOptions<'bar'>>(() => {
  const c = colors.value
  const tick = (value: number | string) =>
    props.metric === 'amount' ? formatCount(Number(value)) : formatBytes(Number(value), 0)
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        border: { color: c.border },
        ticks: { color: c.textMuted, maxRotation: 0, autoSkipPadding: 24 },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: c.grid },
        border: { display: false },
        ticks: { color: c.textMuted, callback: tick, maxTicksLimit: 6 },
      },
    },
    plugins: {
      legend: {
        display: props.selected.length !== 1,
        position: 'bottom',
        labels: { color: c.textSecondary, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2, padding: 12 },
      },
      tooltip: {
        ...tooltipStyle(c),
        enabled: !brushing.value,
        usePointStyle: true,
        itemSort: (a: TooltipItem<'bar'>, b: TooltipItem<'bar'>) => b.parsed.y! - a.parsed.y!,
        filter: (item: TooltipItem<'bar'>) => item.parsed.y! > 0,
        callbacks: {
          label: (item: TooltipItem<'bar'>) => ` ${item.dataset.label}: ${formatValue(item.parsed.y!)}`,
          footer: (items: TooltipItem<'bar'>[]) =>
            items.length > 1 ? `Total: ${formatValue(items.reduce((sum, i) => sum + i.parsed.y!, 0))}` : '',
        },
      },
    },
  }
})

function bucketAt(clientX: number, el: HTMLElement): number | null {
  const chart = chartRef.value?.chart
  if (!chart) return null
  const x = clientX - el.getBoundingClientRect().left
  const { left, right } = chart.chartArea
  const clamped = Math.min(Math.max(x, left), right - 1)
  const index = Math.round(chart.scales.x!.getValueForPixel(clamped) ?? 0)
  return Math.min(Math.max(index, 0), props.series.buckets.length - 1)
}

function onDown(event: PointerEvent) {
  if (event.button !== 0 || event.pointerType === 'touch') return
  const el = event.currentTarget as HTMLElement
  const chart = chartRef.value?.chart
  const y = event.clientY - el.getBoundingClientRect().top
  if (!chart || y < chart.chartArea.top || y > chart.chartArea.bottom) return
  const index = bucketAt(event.clientX, el)
  if (index === null) return
  pointerId = event.pointerId
  el.setPointerCapture(event.pointerId)
  brush.value = { from: index, to: index }
}

function onMove(event: PointerEvent) {
  if (pointerId !== event.pointerId || !brush.value) return
  const index = bucketAt(event.clientX, event.currentTarget as HTMLElement)
  if (index !== null) brush.value = { ...brush.value, to: index }
}

function onUp(event: PointerEvent) {
  if (pointerId !== event.pointerId) return
  pointerId = null
  const b = brush.value
  brush.value = null
  // A click without a drag is not a selection.
  if (!b || b.from === b.to) return
  const { buckets, bucketMs } = props.series
  const lo = Math.min(b.from, b.to)
  const hi = Math.max(b.from, b.to)
  emit('zoom', { start: buckets[lo]!, end: buckets[hi]! + bucketMs })
}

/** Pixel box of the brush, snapped to whole bars. */
const brushBox = computed(() => {
  const chart = chartRef.value?.chart
  const b = brush.value
  if (!chart || !b) return null
  const scale = chart.scales.x!
  const half = (scale.getPixelForValue(1) - scale.getPixelForValue(0)) / 2 || 4
  const left = scale.getPixelForValue(Math.min(b.from, b.to)) - half
  const right = scale.getPixelForValue(Math.max(b.from, b.to)) + half
  return { left, width: right - left, top: chart.chartArea.top, height: chart.chartArea.bottom - chart.chartArea.top }
})
</script>

<template>
  <div
    class="relative h-full w-full cursor-crosshair select-none"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <Bar ref="chart" :data="data" :options="options" />
    <div
      v-if="brushBox"
      class="pointer-events-none absolute rounded-[3px] border border-orange bg-orange-soft"
      :style="{ left: `${brushBox.left}px`, top: `${brushBox.top}px`, width: `${brushBox.width}px`, height: `${brushBox.height}px` }"
    />
  </div>
</template>
