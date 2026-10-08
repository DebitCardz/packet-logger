<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes, formatCount, formatPercent } from '../lib/format'
import type { Direction, Metric, PacketTotal } from '../lib/types'
import { metricValue } from '../composables/usePacketLog'

const props = defineProps<{ packets: PacketTotal[]; metric: Metric }>()

const META: Record<Direction, { label: string; detail: string; color: string }> = {
  out: { label: 'Outgoing', detail: 'server → clients', color: 'bg-dir-out' },
  in: { label: 'Incoming', detail: 'clients → server', color: 'bg-dir-in' },
  unknown: { label: 'Unknown', detail: 'no direction recorded', color: 'bg-ink-3' },
}

const rows = computed(() => {
  const total = props.packets.reduce((sum, p) => sum + metricValue(p, props.metric), 0)
  return (['out', 'in', 'unknown'] as const)
    .map((direction) => {
      const group = props.packets.filter((p) => p.direction === direction)
      const value = group.reduce((sum, p) => sum + metricValue(p, props.metric), 0)
      return { direction, ...META[direction], value, types: group.length, share: total ? value / total : 0 }
    })
    .filter((row) => row.types > 0)
})

const format = (value: number) => (props.metric === 'amount' ? `${formatCount(value)} packets` : formatBytes(value))
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex h-6 gap-0.5 overflow-hidden border-[3px] border-line bg-line" role="img" :aria-label="rows.map((r) => `${r.label} ${formatPercent(r.share)}`).join(', ')">
      <span
        v-for="row in rows"
        :key="row.direction"
        :class="row.color"
        class="block h-full min-w-0.5"
        :style="{ width: `${row.share * 100}%` }"
      />
    </div>
    <dl class="flex flex-col gap-3">
      <div v-for="row in rows" :key="row.direction" class="grid grid-cols-[12px_1fr_auto] items-baseline gap-x-2.5">
        <span class="size-3 translate-y-0.5 rounded-[3px]" :class="row.color" aria-hidden="true" />
        <dt class="text-white-ink">{{ row.label }} <span class="text-ink-3">{{ row.detail }}</span></dt>
        <dd class="text-right text-white-ink tabular-nums">{{ formatPercent(row.share) }}</dd>
        <dd class="col-start-2 col-end-4 text-ink-2 tabular-nums">{{ format(row.value) }} across {{ row.types }} {{ row.types === 1 ? 'type' : 'types' }}</dd>
      </div>
    </dl>
  </div>
</template>
