<script setup lang="ts">
import { Chart, type ChartData, type ChartOptions, type TooltipItem } from 'chart.js'
import { computed, ref, useTemplateRef, watch } from 'vue'
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
const emit = defineEmits<{ zoom: [window: TimeWindow]; select: [name: string, additive: boolean] }>()

const colors = useThemeColors()

// Drag across the chart to zoom into that timeframe.
const chartRef = useTemplateRef<{ chart: Chart<'bar'> | null }>('chart')
const brush = ref<{ from: number; to: number } | null>(null)
/** Only flips at the start and end of a drag, so the chart isn't rebuilt on every mouse move. */
const brushing = computed(() => brush.value !== null)
let pointerId: number | null = null
/** Where a press started; it only becomes a brush once the pointer moves to another bar. */
let press: { index: number; segment: number | null } | null = null

const formatValue = (value: number) => (props.metric === 'amount' ? formatExactCount(value) : formatBytes(value, 2))

/** Thin surface-coloured line between stacked segments; dropped when bars get too thin for it. */
const segmentBorder = (buckets: number) => ({ color: colors.value.surface, width: { top: buckets > 240 ? 0 : 1 } })
const OTHER_PREFIX = 'Other ('

const data = computed<ChartData<'bar'>>(() => {
  const { series, metric, packets, topNames, slots, selected } = props
  const values = series[metric]
  const zeros = () => new Array<number>(series.buckets.length).fill(0)
  const dataset = (label: string, data: number[], color: string) => ({
    label,
    data,
    backgroundColor: color,
    hoverBackgroundColor: color,
    borderColor: segmentBorder(series.buckets.length).color,
    borderWidth: segmentBorder(series.buckets.length).width,
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
      datasets.push(dataset(`${OTHER_PREFIX}${rest.length} types)`, other, colors.value.other))
    }
  }

  return {
    labels: series.buckets.map((t) => formatBucketLabel(t, series.bucketMs, props.spansDays)),
    datasets,
  }
})

// Hovering a segment (or its legend entry) gently fades the other packet types and outlines the segment under the cursor.
/** 8-digit hex alpha suffix for the other segments (about 65% opacity), enough to recede without going muddy. */
const FADED = 'A6'
let hovered: number | null = null
/** Chart.js replays its last mouse event after every update, even once the cursor has left. */
let pointerInside = false
// Read before any fading is applied, so these stay the real colours.
const baseColors = computed(() => data.value.datasets.map((d) => d.backgroundColor as string))
watch(data, () => (hovered = null))

function onEnter() {
  pointerInside = true
}

function onLeave() {
  pointerInside = false
  setHover(null)
}

function setHover(index: number | null) {
  const chart = chartRef.value?.chart
  if (!chart || index === hovered) return
  const base = baseColors.value
  hovered = index
  const buckets = props.series.buckets.length
  // An outline only reads when bars are wide enough to hold it.
  const outline = chart.chartArea.width / buckets >= 5
  chart.data.datasets.forEach((ds, i) => {
    const active = i === index
    const color = index === null || active ? base[i]! : `${base[i]}${FADED}`
    ds.backgroundColor = color
    ds.hoverBackgroundColor = color
    // Hover styles only apply to the bar column under the cursor, so exactly that segment gets the outline.
    // Undefined falls back to the normal border.
    ds.hoverBorderColor = active && outline ? colors.value.white : undefined
    ds.hoverBorderWidth = active && outline ? 1.5 : undefined
  })
  chart.update('none')
}

const options = computed<ChartOptions<'bar'>>(() => {
  const c = colors.value
  const tick = (value: number | string) =>
    props.metric === 'amount' ? formatCount(Number(value)) : formatBytes(Number(value), 0)
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    onHover: (event, _elements, chart) => {
      if (brushing.value || !event.native) return
      if (!pointerInside || event.type === 'mouseout') return setHover(null)
      // Pick the segment at the cursor's height in the nearest bar, so gaps between bars don't flicker.
      const y = event.y ?? 0
      const column = chart.getElementsAtEventForMode(event.native, 'index', { intersect: false }, false)
      const hit = column.find(({ element }) => {
        const { y: top, base } = element.getProps(['y', 'base'], true) as { y: number; base: number }
        return y >= Math.min(top, base) && y <= Math.max(top, base)
      })
      setHover(hit ? hit.datasetIndex : null)
    },
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
        labels: {
          color: c.textSecondary,
          boxWidth: 10,
          boxHeight: 10,
          useBorderRadius: true,
          borderRadius: 2,
          padding: 12,
          // Chart.js caches segment styles, so swatches come from the real colours; the hovered entry stays bright.
          generateLabels: (chart) =>
            Chart.defaults.plugins.legend.labels.generateLabels(chart).map((item, i) => {
              const base = baseColors.value[i] ?? item.fillStyle
              const dim = hovered !== null && i !== hovered
              return { ...item, fillStyle: base, strokeStyle: base, fontColor: dim ? c.textMuted : c.textSecondary }
            }),
        },
        onHover: (_event, item) => setHover(item.datasetIndex ?? null),
        onLeave: () => setHover(null),
      },
      tooltip: {
        ...tooltipStyle(c),
        enabled: !brushing.value,
        usePointStyle: true,
        itemSort: (a: TooltipItem<'bar'>, b: TooltipItem<'bar'>) => b.parsed.y! - a.parsed.y!,
        filter: (item: TooltipItem<'bar'>) => item.parsed.y! > 0,
        callbacks: {
          label: (item: TooltipItem<'bar'>) =>
            `${item.datasetIndex === hovered ? '▸' : ' '} ${item.dataset.label}: ${formatValue(item.parsed.y!)}`,
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
  press = { index, segment: hovered }
}

function onMove(event: PointerEvent) {
  if (pointerId !== event.pointerId || !press) return
  const index = bucketAt(event.clientX, event.currentTarget as HTMLElement)
  if (index === null || (!brush.value && index === press.index)) return
  if (!brush.value) setHover(null)
  brush.value = { from: press.index, to: index }
}

function onUp(event: PointerEvent) {
  if (pointerId !== event.pointerId) return
  pointerId = null
  const b = brush.value
  const pressed = press
  brush.value = null
  press = null
  // A click without a drag toggles the packet type under the cursor.
  if (!b) {
    const label = pressed?.segment != null ? data.value.datasets[pressed.segment]?.label : undefined
    if (event.type === 'pointerup' && label && !label.startsWith(OTHER_PREFIX)) {
      emit('select', label, event.shiftKey || event.ctrlKey || event.metaKey)
    }
    return
  }
  if (b.from === b.to) return
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
    @pointerenter="onEnter"
    @pointerleave="onLeave"
  >
    <Bar ref="chart" :data="data" :options="options" />
    <div
      v-if="brushBox"
      class="pointer-events-none absolute rounded-[3px] border border-orange bg-orange-soft"
      :style="{ left: `${brushBox.left}px`, top: `${brushBox.top}px`, width: `${brushBox.width}px`, height: `${brushBox.height}px` }"
    />
  </div>
</template>
