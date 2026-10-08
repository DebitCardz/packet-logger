import { computed, ref, shallowRef } from 'vue'
import type { DatasetKey, LoadResult, SampleVariant, Summary } from '../lib/types'
import { useDatabaseWorker } from './useDatabaseWorker'

export interface Range {
  start: number
  end: number
  /** Sessions can be days apart, so rates use the time actually recorded. */
  recordedMs: number
  spansDays: boolean
}

/** One set of loaded SQLite files: the overview, or one side of a comparison. */
export function useDataset(key: DatasetKey) {
  const db = useDatabaseWorker(key)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const summary = shallowRef<Summary | null>(null)

  const range = computed<Range | null>(() => {
    const files = summary.value?.files ?? []
    if (!files.length) return null
    const start = Math.min(...files.map((f) => f.start))
    const end = Math.max(...files.map((f) => f.end))
    return {
      start,
      end,
      recordedMs: files.reduce((sum, f) => sum + (f.end - f.start), 0),
      spansDays: new Date(start).toDateString() !== new Date(end).toDateString(),
    }
  })

  /** Packets per second of recording are what make sessions of different lengths comparable. */
  const seconds = computed(() => Math.max((range.value?.recordedMs ?? 0) / 1000, 1))

  async function apply(task: () => Promise<LoadResult>): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const { added, ...result } = await task()
      if (!added) {
        const reasons = result.skipped.map((s) => `${s.name}: ${s.reason}`).join('; ')
        throw new Error(reasons || 'No files were loaded.')
      }
      summary.value = result
      if (result.skipped.length) {
        error.value = `Skipped ${result.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`
      }
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    summary,
    range,
    seconds,
    addFiles: (files: File[]) => apply(() => db.load(files)),
    /** Replaces whatever is loaded, unlike addFiles which merges. */
    replaceFiles: (files: File[]) => apply(() => db.load(files, true)),
    loadSample: (variant: SampleVariant) => apply(() => db.sample(variant)),
    series: db.series,
    totals: db.totals,
    async reset() {
      await db.reset()
      summary.value = null
      error.value = null
    },
  }
}

export type Dataset = ReturnType<typeof useDataset>
