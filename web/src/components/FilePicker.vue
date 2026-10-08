<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { formatBytes } from '../lib/format'
import type { LoadedFile } from '../lib/types'

const props = withDefaults(
  defineProps<{
    title?: string
    hint?: string
    loading?: boolean
    error?: string | null
    files?: LoadedFile[]
    tall?: boolean
  }>(),
  { title: 'Drop SQLite files here', hint: 'or click to browse', loading: false, error: null, files: () => [], tall: false },
)
const emit = defineEmits<{ files: [files: File[]] }>()

const input = useTemplateRef('input')
const over = ref(false)

function onDrop(event: DragEvent) {
  over.value = false
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length) emit('files', files)
}

function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const files = [...(target.files ?? [])]
  target.value = ''
  if (files.length) emit('files', files)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      type="button"
      class="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[5px] border-2 border-dashed border-line-light bg-surface px-4 text-center text-ink-2 transition-colors hover:border-orange hover:bg-hover disabled:cursor-wait"
      :class="[over && 'border-orange bg-hover', props.tall ? 'flex-1 py-14' : 'py-7']"
      :disabled="loading"
      @click="input?.click()"
      @dragenter.prevent.stop="over = true"
      @dragover.prevent.stop="over = true"
      @dragleave.prevent.stop="over = false"
      @drop.prevent.stop="onDrop"
    >
      <svg v-if="!loading" class="size-8 text-ink-3" :class="over && 'text-orange'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 16V4m0 0L7 9m5-5 5 5" />
        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <svg v-else class="size-8 animate-spin text-orange" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".2" stroke-width="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
      <strong class="text-[15px] font-normal text-white-ink">{{ loading ? 'Reading files...' : title }}</strong>
      <span class="max-w-md">{{ hint }}</span>
    </button>
    <input ref="input" type="file" accept=".sqlite,.sqlite3,.db" multiple class="hidden" @change="onPick" />

    <ul v-if="files.length" class="flex flex-col gap-0.5 text-ink-2">
      <li v-for="file in files" :key="file.name + file.start" class="flex justify-between gap-3">
        <span class="truncate text-white-ink">{{ file.name }}</span>
        <span class="shrink-0 text-ink-3">{{ formatBytes(file.sizeBytes) }}</span>
      </li>
    </ul>
    <p v-if="error" role="alert" class="rounded-[5px] bg-bad-soft px-2.5 py-1.5 text-bad">{{ error }}</p>
  </div>
</template>
