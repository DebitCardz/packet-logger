<script setup lang="ts">
import { computed } from 'vue'
import CompareTimeline from '../components/CompareTimeline.vue'
import DiffList from '../components/DiffList.vue'
import FilePicker from '../components/FilePicker.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import SelectControl from '../components/SelectControl.vue'
import SparkWidget, { type WidgetValue } from '../components/SparkWidget.vue'
import { DIRECTIONS, METRICS } from '../lib/controls'
import { formatBytes, formatChange, formatCount, formatDuration } from '../lib/format'
import { NOISE, type Comparison } from '../composables/useComparison'
import { filterDirection } from '../composables/usePacketLog'

const props = defineProps<{ cmp: Comparison }>()
const { before, after, direction, metric, bucketMs, bucketOptions, beforeSeries, afterSeries, ready, loading, totals, rows } = props.cmp

/** Less traffic is the usual goal, so a drop reads as good. */
function change(b: number, a: number, lowerIsBetter = true): WidgetValue {
  if (!b) return { value: a ? 'new' : '0', label: 'change', tone: 'text-ink-2!' }
  const c = (a - b) / b
  const better = lowerIsBetter ? c < 0 : c > 0
  const flat = Math.abs(c) < NOISE
  return {
    value: `${flat ? '=' : c < 0 ? '▼' : '▲'} ${formatChange(c)}`,
    label: 'change',
    tone: flat ? 'text-ink-2!' : better ? 'text-good!' : 'text-bad!',
  }
}

const widgets = computed(() => {
  const { before: b, after: a } = totals.value
  return [
    { title: 'Packets', subtitle: 'per second', values: [
      { value: formatCount(b.amountRate), label: 'before' },
      { value: formatCount(a.amountRate), label: 'after' },
      change(b.amountRate, a.amountRate),
    ] },
    { title: 'Bandwidth', subtitle: 'per second', values: [
      { value: formatBytes(b.bytesRate), label: 'before' },
      { value: formatBytes(a.bytesRate), label: 'after' },
      change(b.bytesRate, a.bytesRate),
    ] },
    { title: 'Avg packet', values: [
      { value: formatBytes(b.avgSize), label: 'before' },
      { value: formatBytes(a.avgSize), label: 'after' },
      { ...change(b.avgSize, a.avgSize), tone: 'text-white-ink' },
    ] },
    { title: 'Packet types', values: [
      { value: String(b.types), label: 'before' },
      { value: String(a.types), label: 'after' },
      { value: `${a.types - b.types > 0 ? '+' : ''}${a.types - b.types}`, label: 'change' },
    ] },
  ]
})

const beforePackets = computed(() => filterDirection(before.summary.value?.packets ?? [], direction.value))
const afterPackets = computed(() => filterDirection(after.summary.value?.packets ?? [], direction.value))

const biggest = computed(() => {
  const meaningful = (r: { status: string; change: number | null }) => r.status !== 'changed' || Math.abs(r.change ?? 0) >= NOISE
  const down = rows.value.find((r) => r.delta < 0 && meaningful(r))
  const up = rows.value.find((r) => r.delta > 0 && meaningful(r))
  return { down, up }
})

const sides = computed(() => [
  { key: 'before' as const, label: 'Before', dataset: before, hint: 'the recording from before your change' },
  { key: 'after' as const, label: 'After', dataset: after, hint: 'the recording from after your change' },
])
</script>

<template>
  <div class="flex flex-col gap-3 pb-6">
    <div class="flex flex-wrap items-end justify-between gap-3 pt-2">
      <div>
        <h1 class="heading text-[20px]!">Compare before vs after</h1>
        <p class="mt-1 max-w-3xl text-ink-2">
          Record once, change a setting or plugin, record again. Numbers are per second of recording,
          so files of different lengths compare fairly. <span class="text-good">Green</span> means less traffic,
          <span class="text-bad">red</span> means more.
        </p>
      </div>
      <button v-if="before.summary.value || after.summary.value" type="button" class="field h-8 cursor-pointer hover:text-white-ink" @click="cmp.reset()">clear both</button>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <section v-for="side in sides" :key="side.key" class="panel">
        <div class="mb-3 flex items-baseline justify-between gap-2">
          <h2 class="heading">{{ side.label }}</h2>
          <span v-if="side.dataset.range.value" class="text-ink-3">
            {{ formatDuration(side.dataset.range.value.recordedMs) }} recorded
          </span>
        </div>
        <FilePicker
          :title="side.dataset.summary.value ? `Replace ${side.label.toLowerCase()} files` : `Drop the ${side.label.toLowerCase()} file`"
          :hint="side.hint"
          :loading="side.dataset.loading.value"
          :error="side.dataset.error.value"
          :files="side.dataset.summary.value?.files"
          @files="side.dataset.replaceFiles"
        />
      </section>
    </div>

    <p v-if="!ready" class="text-center text-ink-2">
      just looking?
      <button type="button" class="cursor-pointer text-accent hover:underline" :disabled="loading" @click="cmp.loadSamples()">load a sample comparison</button>
    </p>

    <template v-if="ready">
      <div class="flex flex-wrap gap-2.5">
        <SparkWidget v-for="w in widgets" :key="w.title" :title="w.title" :subtitle="w.subtitle" :values="w.values" />
      </div>

      <p v-if="biggest.down || biggest.up" class="text-ink-2">
        <template v-if="biggest.down">
          Biggest drop: <span class="text-white-ink">{{ biggest.down.name }}</span>
          <span class="text-good"> ▼ {{ biggest.down.status === 'gone' ? 'gone' : formatChange(biggest.down.change ?? 0) }}</span>.
        </template>
        <template v-if="biggest.up">
          Biggest increase: <span class="text-white-ink">{{ biggest.up.name }}</span>
          <span class="text-bad"> ▲ {{ biggest.up.status === 'new' ? 'new' : formatChange(biggest.up.change ?? 0) }}</span>.
        </template>
      </p>

      <div class="sticky top-[49px] z-10 flex flex-wrap items-end gap-2.5 bg-bg py-2">
        <SegmentedControl v-model="direction" label="direction" :options="DIRECTIONS" />
        <SegmentedControl v-model="metric" label="measure" :options="METRICS" />
        <SelectControl v-model="bucketMs" label="group by" :options="bucketOptions" />
      </div>

      <section class="panel">
        <h2 class="heading">{{ metric === 'amount' ? 'Packets' : 'Data' }} per second over time</h2>
        <p class="mt-0.5 mb-3 text-ink-3">both recordings lined up from their first minute</p>
        <div class="relative h-72 sm:h-[360px]">
          <CompareTimeline
            v-if="beforeSeries && afterSeries"
            :before="beforeSeries"
            :after="afterSeries"
            :before-packets="beforePackets"
            :after-packets="afterPackets"
            :metric="metric"
          />
        </div>
      </section>

      <section class="panel">
        <DiffList :rows="rows" :metric="metric" />
      </section>
    </template>
  </div>
</template>
