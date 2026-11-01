<script setup lang="ts">
import { computed } from 'vue'
import FilePicker from '../components/FilePicker.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import SparkWidget from '../components/SparkWidget.vue'
import { DIRECTIONS } from '../lib/controls'
import { formatBytes, formatDuration, formatExactCount } from '../lib/format'
import type { Capture } from '../lib/types'
import type { Captures } from '../composables/useCaptures'

const props = defineProps<{ cap: Captures }>()
const { loading, error, summary, captures, capture, direction, query, packets, expanded } = props.cap

const widgets = computed(() => {
  const c = capture.value
  if (!c) return []
  const incoming = c.packets.filter((p) => p.direction === 'in').length
  const bytes = c.packets.reduce((sum, p) => sum + p.sizeBytes, 0)
  return [
    { title: 'Capture', values: [
      { value: c.player, label: 'player', title: c.playerUuid },
      { value: formatDuration(c.end - c.start), label: 'duration' },
    ] },
    { title: 'Packets', values: [
      { value: formatExactCount(incoming), label: 'incoming' },
      { value: formatExactCount(c.packets.length - incoming), label: 'outgoing' },
    ] },
    { title: 'Data', values: [
      { value: formatBytes(bytes), label: 'total' },
      { value: formatBytes(c.packets.length ? bytes / c.packets.length : 0), label: 'avg size' },
    ] },
  ]
})

const started = (c: Capture) => new Date(c.start).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
const elapsed = (at: number) => `+${((at - (capture.value?.start ?? at)) / 1000).toFixed(3)}s`

/** Bodies come from the plugin as JSON text; anything unparseable is shown as is. */
function parse(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}
const pretty = (data: string) => JSON.stringify(parse(data), null, 2)

/** The whole capture as one JSON file, packet contents included. */
function download(c: Capture) {
  const json = JSON.stringify({
    player: c.player,
    uuid: c.playerUuid,
    startedAt: new Date(c.start).toISOString(),
    packets: c.packets.map((p) => ({ ms: p.at - c.start, direction: p.direction, name: p.name, sizeBytes: p.sizeBytes, data: parse(p.data) })),
  }, null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `capture_${c.player}_${c.start}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}
</script>

<template>
  <div class="flex flex-col gap-3 pb-6">
    <div class="flex flex-wrap items-end justify-between gap-3 pt-2">
      <div>
        <h1 class="heading text-[20px]!">Packet capture</h1>
        <p class="mt-1 max-w-3xl text-ink-2">
          Every packet one player sent and received over a few seconds, with what was inside it.
          Run <span class="text-white-ink">/packetlogger capture &lt;player&gt;</span> on your server, then drop that session's file here.
        </p>
      </div>
      <button v-if="summary" type="button" class="field h-8 cursor-pointer hover:text-white-ink" @click="cap.reset()">close</button>
    </div>

    <template v-if="!summary">
      <section class="panel">
        <FilePicker :loading="loading" :error="error" hint="or click to browse for the packets_*.sqlite file with your capture" @files="cap.replaceFiles" />
      </section>
      <p class="text-center text-ink-2">
        just looking?
        <button type="button" class="cursor-pointer text-accent hover:underline" :disabled="loading" @click="cap.loadSample('capture')">load a sample capture</button>
      </p>
    </template>

    <template v-else-if="capture">
      <p v-if="error" role="alert" class="rounded-[5px] bg-bad-soft px-2.5 py-1.5 text-bad">{{ error }}</p>

      <div v-if="captures.length > 1" class="flex flex-wrap gap-2" role="group" aria-label="Captures">
        <button
          v-for="c in captures"
          :key="c.key"
          type="button"
          class="field h-8 cursor-pointer hover:text-white-ink"
          :class="c.key === capture.key && 'text-white-ink shadow-[inset_0_-3px_0_var(--orange)]'"
          :aria-pressed="c.key === capture.key"
          @click="cap.select(c.key)"
        >
          {{ c.player }}, {{ started(c) }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2.5">
        <SparkWidget v-for="w in widgets" :key="w.title" :title="w.title" :values="w.values" />
      </div>

      <div class="sticky top-[49px] z-10 flex flex-wrap items-end gap-2.5 bg-bg py-2">
        <SegmentedControl v-model="direction" label="direction" :options="DIRECTIONS" />
        <input v-model="query" type="search" placeholder="search packets..." aria-label="Search packet types" class="field w-full sm:w-64" />
        <button type="button" class="field cursor-pointer hover:text-white-ink sm:ml-auto" @click="download(capture)">download JSON</button>
      </div>

      <section class="panel">
        <h2 class="heading">Packets</h2>
        <p class="mt-0.5 mb-3 text-ink-3">in the order the server saw them, started {{ started(capture) }}. click a packet to see its contents</p>

        <div class="flex items-center gap-3 border-b border-line px-2 pb-1.5 text-[12px] text-ink-3">
          <span class="w-20 text-right">time</span>
          <span class="w-8">dir</span>
          <span class="flex-1">packet</span>
          <span class="w-16 text-right">size</span>
        </div>

        <ul class="py-1">
          <li v-for="p in packets" :key="p.id">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-3 rounded-[3px] px-2 py-1 text-left hover:bg-surface-2"
              :class="expanded.has(p.id) && 'bg-surface-2 shadow-[inset_3px_0_0_var(--orange)]'"
              :aria-expanded="expanded.has(p.id)"
              @click="cap.toggle(p.id)"
            >
              <span class="w-20 text-right text-ink-3 tabular-nums">{{ elapsed(p.at) }}</span>
              <span class="w-8 text-[11px] text-ink-3">{{ p.direction }}</span>
              <span class="min-w-0 flex-1 truncate text-ink-2" :class="expanded.has(p.id) && 'text-white-ink'">{{ p.name }}</span>
              <span class="w-16 text-right tabular-nums">{{ formatBytes(p.sizeBytes) }}</span>
            </button>
            <pre v-if="expanded.has(p.id)" class="mx-2 mt-1 mb-2 overflow-x-auto rounded-[5px] bg-bg p-3 text-[12px]">{{ pretty(p.data) }}</pre>
          </li>
          <li v-if="!packets.length" class="py-6 text-center text-ink-3">no packets match these filters</li>
        </ul>
      </section>
    </template>
  </div>
</template>
