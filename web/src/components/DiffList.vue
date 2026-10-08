<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatChange, formatRate } from '../lib/format'
import type { Metric } from '../lib/types'
import { NOISE, type DiffRow } from '../composables/useComparison'

type Show = 'all' | 'down' | 'up' | 'changed-set'

const props = defineProps<{ rows: DiffRow[]; metric: Metric }>()

const query = ref('')
const show = ref<Show>('all')

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'down', label: 'decreased' },
  { value: 'up', label: 'increased' },
  { value: 'changed-set', label: 'new or gone' },
]

const visible = computed(() => {
  const needle = query.value.trim().toUpperCase().replace(/\s+/g, '_')
  return props.rows.filter((row) => {
    if (needle && !row.name.includes(needle)) return false
    if (show.value === 'down') return trend(row) < 0
    if (show.value === 'up') return trend(row) > 0
    if (show.value === 'changed-set') return row.status !== 'changed'
    return true
  })
})

/** Diverging bars share one scale: the biggest absolute change fills half the track. */
const maxDelta = computed(() => Math.max(...props.rows.map((r) => Math.abs(r.delta)), Number.EPSILON))

function changeLabel(row: DiffRow): string {
  if (row.status === 'new') return 'new'
  if (row.status === 'gone') return 'gone'
  return formatChange(row.change ?? 0)
}

/** -1 less, 1 more, 0 no meaningful change. */
const trend = (row: DiffRow) => (row.status === 'changed' && Math.abs(row.change ?? 0) < NOISE ? 0 : Math.sign(row.delta))
const tone = (row: DiffRow) => ['text-good bg-good-soft', 'text-ink-3 bg-surface-2', 'text-bad bg-bad-soft'][trend(row) + 1]
const arrow = (row: DiffRow) => ['▼', '=', '▲'][trend(row) + 1]
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 class="heading">Changes per packet type</h2>
      <div class="flex w-full flex-wrap gap-2 sm:w-auto">
        <select v-model="show" class="field bg-surface-2 pr-8" aria-label="Show packets">
          <option v-for="o in SHOW_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <input v-model="query" type="search" placeholder="search packets..." aria-label="Search packet types" class="field min-w-0 flex-1 bg-surface-2 sm:w-56" />
      </div>
    </div>

    <div class="flex items-center gap-3 border-b border-line px-2 pb-1.5 text-[12px] text-ink-3">
      <span class="flex-1">packet</span>
      <span class="hidden w-24 text-right sm:block">before</span>
      <span class="hidden w-24 text-right sm:block">after</span>
      <span class="w-24 text-right">change</span>
      <span class="hidden w-48 text-center md:block">less ← → more</span>
    </div>

    <ul class="max-h-[600px] overflow-y-auto py-1">
      <li v-for="row in visible" :key="row.name" class="flex items-center gap-3 rounded-[3px] px-2 py-1 hover:bg-surface-2">
        <span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
          <span class="truncate text-ink-2">{{ row.name }}</span>
          <span class="text-[11px] text-ink-3 sm:hidden">{{ formatRate(row.before, metric) }} → {{ formatRate(row.after, metric) }}</span>
        </span>
        <span class="hidden w-24 text-right text-ink-2 tabular-nums sm:block">{{ formatRate(row.before, metric) }}</span>
        <span class="hidden w-24 text-right text-white-ink tabular-nums sm:block">{{ formatRate(row.after, metric) }}</span>
        <span class="w-24 text-right">
          <span class="rounded-[3px] px-1.5 text-[90%] whitespace-nowrap tabular-nums" :class="tone(row)">
            <span aria-hidden="true">{{ arrow(row) }}</span> {{ changeLabel(row) }}
          </span>
        </span>
        <span class="relative hidden h-[15px] w-48 overflow-hidden rounded-full border border-line-dark bg-surface-2 md:block" aria-hidden="true">
          <span class="absolute inset-y-0 left-1/2 w-px bg-line-light" />
          <span
            class="absolute inset-y-0"
            :class="[row.delta < 0 ? 'right-1/2 rounded-l-full' : 'left-1/2 rounded-r-full', ['bg-good', 'bg-line-light', 'bg-bad'][trend(row) + 1]]"
            :style="{ width: `${(Math.abs(row.delta) / maxDelta) * 50}%` }"
          />
        </span>
      </li>
      <li v-if="!visible.length" class="py-6 text-center text-ink-3">no packet types match</li>
    </ul>
  </div>
</template>
