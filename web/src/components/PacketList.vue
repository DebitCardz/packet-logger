<script setup lang="ts">
import { computed, ref } from 'vue'
import { colorFor } from '../lib/colors'
import { formatBytes, formatExactCount, formatPercent } from '../lib/format'
import type { Metric, PacketTotal } from '../lib/types'
import { metricValue } from '../composables/usePacketLog'
import { useThemeColors } from '../composables/useThemeColors'

type SortKey = 'share' | 'name' | 'amount' | 'bytes' | 'avg'

const props = defineProps<{
  packets: PacketTotal[]
  slots: Map<string, number>
  metric: Metric
  selected: string[]
  seconds: number
}>()
const emit = defineEmits<{ select: [name: string, additive: boolean]; clear: [] }>()

const colors = useThemeColors()
const query = ref('')
const sortKey = ref<SortKey>('share')
const ascending = ref(false)

const COLUMNS: { key: SortKey; label: string; class: string }[] = [
  { key: 'amount', label: 'count', class: 'w-28 hidden md:block' },
  { key: 'bytes', label: 'data', class: 'w-24 hidden md:block' },
  { key: 'avg', label: 'avg size', class: 'w-20 hidden lg:block' },
]
const DIRECTION_LABEL = { in: 'in', out: 'out', unknown: '?' }

const total = computed(() => props.packets.reduce((sum, p) => sum + metricValue(p, props.metric), 0))

const rows = computed(() => {
  const needle = query.value.trim().toUpperCase().replace(/\s+/g, '_')
  const list = props.packets
    .filter((p) => !needle || p.name.includes(needle))
    .map((p) => ({
      ...p,
      avg: p.amount ? p.bytes / p.amount : 0,
      share: total.value ? metricValue(p, props.metric) / total.value : 0,
    }))
  const key = sortKey.value
  const dir = ascending.value ? 1 : -1
  return list.sort((a, b) => {
    const x = a[key]
    const y = b[key]
    return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * dir
  })
})

/** Bars are scaled to the largest row so small packets stay visible. */
const maxShare = computed(() => Math.max(...rows.value.map((r) => r.share), 0.0001))

function sortBy(key: SortKey) {
  if (sortKey.value === key) ascending.value = !ascending.value
  else {
    sortKey.value = key
    ascending.value = key === 'name'
  }
}

const arrow = (key: SortKey) => (sortKey.value === key ? (ascending.value ? ' ▴' : ' ▾') : '')
const isSelected = (name: string) => props.selected.includes(name)
const onRowClick = (event: MouseEvent, name: string) => emit('select', name, event.shiftKey || event.ctrlKey || event.metaKey)
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="heading">Packet types</h2>
        <p class="mt-0.5 text-ink-3">
          <template v-if="selected.length">
            {{ selected.length }} selected,
            <button type="button" class="cursor-pointer text-accent hover:underline" @click="emit('clear')">clear</button>
          </template>
          <template v-else>click to show in the timeline, shift+click to pick several, click again to deselect</template>
        </p>
      </div>
      <input v-model="query" type="search" placeholder="search packets..." aria-label="Search packet types" class="field w-full bg-surface-2 sm:w-64" />
    </div>

    <div class="flex items-center gap-3 border-b border-line px-2 pb-1.5 text-[12px] text-ink-3">
      <button type="button" class="flex-1 cursor-pointer text-left hover:text-white-ink" @click="sortBy('name')">packet{{ arrow('name') }}</button>
      <button type="button" class="w-16 cursor-pointer text-right hover:text-white-ink" @click="sortBy('share')">share{{ arrow('share') }}</button>
      <button v-for="col in COLUMNS" :key="col.key" type="button" class="cursor-pointer text-right hover:text-white-ink" :class="col.class" @click="sortBy(col.key)">
        {{ col.label }}{{ arrow(col.key) }}
      </button>
      <span class="hidden w-40 sm:block" />
    </div>

    <ul class="max-h-[560px] overflow-y-auto py-1">
      <li v-for="row in rows" :key="row.name">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 rounded-[3px] px-2 py-1 text-left hover:bg-surface-2"
          :class="isSelected(row.name) && 'bg-surface-2 shadow-[inset_3px_0_0_var(--orange)]'"
          :aria-pressed="isSelected(row.name)"
          @mousedown="$event.shiftKey && $event.preventDefault()"
          @click="onRowClick($event, row.name)"
        >
          <span class="flex min-w-0 flex-1 items-center gap-2">
            <span class="size-2.5 shrink-0 rounded-sm" :style="{ background: colorFor(row.name, slots, colors) }" aria-hidden="true" />
            <span class="truncate text-ink-2" :class="isSelected(row.name) && 'text-white-ink'">{{ row.name }}</span>
            <span class="shrink-0 text-[11px] text-ink-3">{{ DIRECTION_LABEL[row.direction] }}</span>
          </span>
          <span class="w-16 text-right"><span class="pill">{{ formatPercent(row.share) }}</span></span>
          <span class="hidden w-28 text-right tabular-nums md:block" :title="`${formatExactCount(row.amount / seconds)} per second`">{{ formatExactCount(row.amount) }}</span>
          <span class="hidden w-24 text-right tabular-nums md:block">{{ formatBytes(row.bytes, 2) }}</span>
          <span class="hidden w-20 text-right text-ink-2 tabular-nums lg:block">{{ formatBytes(row.avg) }}</span>
          <span class="hidden h-[15px] w-40 overflow-hidden rounded-full border border-line-dark bg-surface-2 sm:block" aria-hidden="true">
            <span class="spark-bar block h-full rounded-full" :style="{ width: `${(row.share / maxShare) * 100}%` }" />
          </span>
        </button>
      </li>
      <li v-if="!rows.length" class="py-6 text-center text-ink-3">no packet types match "{{ query }}"</li>
    </ul>
  </div>
</template>
