import { computed, ref, shallowRef, watch } from 'vue'
import type { Capture, DirectionFilter } from '../lib/types'
import { useDataset } from './useDataset'

/** State for the capture page: one player's packets, with their contents. */
export function useCaptures() {
  const data = useDataset('capture')

  const captures = shallowRef<Capture[]>([])
  const selectedKey = ref<string | null>(null)
  const direction = ref<DirectionFilter>('all')
  const query = ref('')
  /** Ids of the packets whose contents are open. */
  const expanded = ref(new Set<number>())

  const capture = computed(() => captures.value.find((c) => c.key === selectedKey.value) ?? captures.value[0] ?? null)

  const packets = computed(() => {
    const needle = query.value.trim().toUpperCase().replace(/\s+/g, '_')
    return (capture.value?.packets ?? []).filter(
      (p) => (direction.value === 'all' || p.direction === direction.value) && (!needle || p.name.includes(needle)),
    )
  })

  watch(data.summary, async (summary) => {
    captures.value = summary ? await data.captures() : []
    if (!captures.value.some((c) => c.key === selectedKey.value)) selectedKey.value = captures.value[0]?.key ?? null
  })

  // Packet ids are only unique within one file, so open packets don't carry over.
  watch(capture, () => (expanded.value = new Set()))

  return {
    ...data,
    captures,
    capture,
    direction,
    query,
    packets,
    expanded,
    select: (key: string) => (selectedKey.value = key),
    toggle(id: number) {
      const next = new Set(expanded.value)
      if (!next.delete(id)) next.add(id)
      expanded.value = next
    },
    async reset() {
      await data.reset()
      direction.value = 'all'
      query.value = ''
    },
  }
}

export type Captures = ReturnType<typeof useCaptures>
