<script setup lang="ts">
import { computed, ref } from 'vue'
import DirectionSplit from '../components/DirectionSplit.vue'
import FilePicker from '../components/FilePicker.vue'
import PacketList from '../components/PacketList.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import SelectControl from '../components/SelectControl.vue'
import SparkWidget from '../components/SparkWidget.vue'
import TimelineChart from '../components/TimelineChart.vue'
import { DIRECTIONS, METRICS } from '../lib/controls'
import { formatBytes, formatCount, formatDuration, formatExactCount } from '../lib/format'
import type { PacketLog } from '../composables/usePacketLog'

const props = defineProps<{ log: PacketLog }>()
const {
  loading, error, summary, range, seconds, recordedMs, series, refreshing,
  direction, metric, bucketMs, bucketOptions, selected, timeWindow, packets, topNames, slots,
} = props.log

const ready = computed(() => !!summary.value && !!range.value && !!series.value)

const widgets = computed(() => {
  const amount = packets.value.reduce((sum, p) => sum + p.amount, 0)
  const bytes = packets.value.reduce((sum, p) => sum + p.bytes, 0)
  const files = summary.value?.files.length ?? 0
  return [
    { title: 'Packets', values: [
      { value: formatCount(amount), label: 'total', title: formatExactCount(amount) },
      { value: formatCount(amount / seconds.value), label: 'per second' },
    ] },
    { title: 'Data', values: [
      { value: formatBytes(bytes), label: 'total' },
      { value: formatBytes(bytes / seconds.value), label: 'per second' },
    ] },
    { title: 'Packet types', values: [
      { value: String(packets.value.length), label: 'seen' },
      { value: formatBytes(amount ? bytes / amount : 0), label: 'avg size' },
    ] },
    timeWindow.value
      ? { title: 'Timeframe', values: [
          { value: formatDuration(recordedMs.value), label: 'selected' },
          { value: new Date(timeWindow.value.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), label: 'starting' },
        ] }
      : { title: 'Recording', values: [
          { value: formatDuration(recordedMs.value), label: 'recorded' },
          { value: String(files), label: files === 1 ? 'session' : 'sessions' },
        ] },
  ]
})

const dateTime: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
const recordedAt = computed(() =>
  range.value
    ? `${new Date(range.value.start).toLocaleString(undefined, dateTime)} to ${new Date(range.value.end).toLocaleString(undefined, dateTime)}`
    : '',
)
const windowLabel = computed(() => {
  const w = timeWindow.value
  if (!w) return ''
  const sameDay = new Date(w.start).toDateString() === new Date(w.end - 1).toDateString()
  const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' }
  const fmt = (ms: number, withDate: boolean) =>
    new Date(ms).toLocaleString(undefined, withDate ? { month: 'short', day: 'numeric', ...time } : time)
  return `${fmt(w.start, !sameDay || !!range.value?.spansDays)} to ${fmt(w.end, !sameDay)}`
})

const timelineTitle = computed(() => {
  const what = metric.value === 'amount' ? 'Packets' : 'Data'
  if (selected.value.length === 1) return `${what} over time: ${selected.value[0]}`
  if (selected.value.length > 1) return `${what} over time: ${selected.value.length} packet types`
  return `${what} over time`
})
const bucketLabel = computed(() => bucketOptions.value.find((o) => o.ms === bucketMs.value)?.label.toLowerCase())

// Dropping files anywhere on the report adds them to it.
const dragDepth = ref(0)
function onDrop(event: DragEvent) {
  dragDepth.value = 0
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length) void props.log.addFiles(files)
}

const STEPS = [
  { title: 'Install packet-logger', body: 'Drop the plugin jar into your server\'s plugins folder and restart.' },
  { title: 'Let it record', body: 'Packets are counted and saved every 5 seconds while the server runs.' },
  { title: 'Grab the file', body: 'Each server start writes a new file to plugins/packet-logger/<date>/packets_<time>.sqlite' },
  { title: 'Drop it here', body: 'Add several files at once to combine sessions into one report.' },
]
</script>

<template>
  <!-- Landing -->
  <div v-if="!ready" class="mx-auto flex max-w-[1100px] flex-col gap-4 pb-10">
    <header class="flex flex-col items-center py-10 text-center sm:py-16">
      <h1 class="bg-linear-135 from-yellow from-20% to-accent bg-clip-text pb-2 text-[clamp(52px,12vw,112px)] leading-none font-bold tracking-tight text-transparent">
        packets
      </h1>
      <p class="mt-3 max-w-xl text-[15px] text-ink-2 sm:text-base">
        See what your Minecraft server sends and receives, broken down by packet type,
        straight from your <a href="https://github.com/DebitCardz/packet-logger">packet-logger</a> recordings.
      </p>
      <a href="#/compare" class="mt-6 rounded-[5px] bg-surface px-4 py-2 text-white-ink hover:bg-surface-2 hover:no-underline">compare two recordings →</a>
    </header>

    <div class="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <section class="panel flex flex-col">
        <h2 class="heading mb-3">Open a report</h2>
        <FilePicker tall class="flex-1" :loading="loading" :error="error" hint="or click to browse for packets_*.sqlite files" @files="log.addFiles" />
      </section>

      <section class="panel">
        <h2 class="heading mb-3">Where's my file?</h2>
        <ol class="flex flex-col gap-3">
          <li v-for="(step, i) in STEPS" :key="step.title" class="flex gap-3">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-surface-2 text-yellow">{{ i + 1 }}</span>
            <span class="min-w-0">
              <span class="block text-white-ink">{{ step.title }}</span>
              <span class="block break-words text-ink-2">{{ step.body }}</span>
            </span>
          </li>
        </ol>
      </section>
    </div>

    <section class="grid gap-4 py-4 sm:grid-cols-3">
      <div class="flex gap-4">
        <svg class="size-10 shrink-0 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <path d="M4 20V10M9 20V4M14 20v-7M19 20V8" />
        </svg>
        <div>
          <h3 class="mb-1 text-yellow">Traffic over time</h3>
          <p class="text-ink-2">A stacked timeline of every flush. Drag across it to zoom into a lag spike.</p>
        </div>
      </div>
      <div class="flex gap-4">
        <svg class="size-10 shrink-0 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h10M4 18h6" />
        </svg>
        <div>
          <h3 class="mb-1 text-yellow">Every packet type</h3>
          <p class="text-ink-2">Counts, sizes and share for each packet, split into incoming and outgoing.</p>
        </div>
      </div>
      <a href="#/compare" class="flex gap-4 text-inherit hover:no-underline">
        <svg class="size-10 shrink-0 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
        </svg>
        <div>
          <h3 class="mb-1 text-yellow">Before vs after</h3>
          <p class="text-ink-2">Changed a setting or plugin? Compare two recordings and see exactly what moved.</p>
        </div>
      </a>
    </section>
  </div>

  <!-- Report -->
  <div
    v-else
    class="flex flex-col gap-3 pb-6"
    :class="loading && 'pointer-events-none opacity-60'"
    @dragenter.prevent="dragDepth++"
    @dragover.prevent
    @dragleave.prevent="dragDepth--"
    @drop.prevent="onDrop"
  >
    <p class="text-ink-2">
      Packet report for <span class="text-white-ink">{{ summary!.files.length === 1 ? summary!.files[0]!.name : `${summary!.files.length} sessions` }}</span>,
      recorded {{ recordedAt }}
    </p>
    <p v-if="error" role="alert" class="rounded-[5px] bg-bad-soft px-2.5 py-1.5 text-bad">{{ error }}</p>

    <div class="flex flex-wrap gap-2.5">
      <SparkWidget v-for="w in widgets" :key="w.title" :title="w.title" :values="w.values" />
    </div>

    <div class="sticky top-[49px] z-10 flex flex-wrap items-end gap-2.5 bg-bg py-2">
      <SegmentedControl v-model="direction" label="direction" :options="DIRECTIONS" />
      <SegmentedControl v-model="metric" label="measure" :options="METRICS" />
      <SelectControl v-model="bucketMs" label="group by" :options="bucketOptions" />
      <div v-if="timeWindow" class="flex flex-col gap-1">
        <span class="text-[11px] text-ink-3">timeframe</span>
        <div class="flex h-9 items-center gap-2 rounded-[5px] bg-orange-soft pr-1 pl-3 text-orange">
          <span class="tabular-nums">{{ windowLabel }}</span>
          <button type="button" class="cursor-pointer rounded-[3px] px-2 py-0.5 hover:bg-orange-soft" aria-label="Show the whole recording" @click="log.zoom(null)">✕</button>
        </div>
      </div>
    </div>

    <section class="panel">
      <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="heading truncate">{{ timelineTitle }}</h2>
          <p class="mt-0.5 text-ink-3">
            totals per {{ bucketLabel }}<template v-if="!selected.length">, top {{ topNames.length }} packet types stacked</template>.
            drag across the chart to zoom in<span v-if="refreshing">, updating...</span>
          </p>
        </div>
        <div class="flex gap-2">
          <button v-if="timeWindow" type="button" class="field h-8 cursor-pointer bg-surface-2 hover:text-white-ink" @click="log.zoom(null)">zoom out</button>
          <button v-if="selected.length" type="button" class="field h-8 cursor-pointer bg-surface-2 hover:text-white-ink" @click="log.clearSelection()">clear selection</button>
        </div>
      </div>
      <div class="relative h-80 sm:h-[400px]">
        <TimelineChart
          :series="series!"
          :packets="packets"
          :top-names="topNames"
          :slots="slots"
          :selected="selected"
          :metric="metric"
          :spans-days="range!.spansDays"
          @zoom="log.zoom"
        />
      </div>
    </section>

    <div class="grid gap-3 lg:grid-cols-[1fr_340px]">
      <section class="panel">
        <PacketList
          :packets="packets"
          :slots="slots"
          :metric="metric"
          :selected="selected"
          :seconds="seconds"
          @select="log.select"
          @clear="log.clearSelection()"
        />
      </section>
      <section class="panel self-start">
        <h2 class="heading mb-1">Direction</h2>
        <p class="mb-4 text-ink-3">share of {{ metric === 'amount' ? 'packets' : 'data' }}{{ timeWindow ? ' in this timeframe' : '' }}</p>
        <DirectionSplit :packets="log.packetsAllDirections.value" :metric="metric" />
      </section>
    </div>

    <div
      v-if="dragDepth > 0"
      class="pointer-events-none fixed inset-3 z-30 flex items-center justify-center rounded-[5px] border-2 border-dashed border-orange bg-bg/80 text-[17px] text-orange backdrop-blur-sm"
    >
      drop to add files to this report
    </div>
  </div>
</template>
