<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useComparison } from './composables/useComparison'
import { usePacketLog } from './composables/usePacketLog'
import { useRoute } from './composables/useRoute'
import { useTheme } from './composables/useTheme'
import { formatBytes } from './lib/format'
import ComparePage from './pages/ComparePage.vue'
import OverviewPage from './pages/OverviewPage.vue'

// Both pages keep their state while you switch between them.
const log = usePacketLog()
const cmp = useComparison()
const route = useRoute()
const { theme, toggle } = useTheme()

const NAV = [
  { route: 'overview', label: 'report', href: '#/' },
  { route: 'compare', label: 'compare', href: '#/compare' },
] as const

const fileSummary = computed(() => {
  const files = log.summary.value?.files ?? []
  if (!files.length) return ''
  const size = formatBytes(files.reduce((sum, f) => sum + f.sizeBytes, 0))
  return files.length === 1 ? `${files[0]!.name} (${size})` : `${files.length} files (${size})`
})

const fileInput = useTemplateRef('fileInput')
function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const files = [...(target.files ?? [])]
  target.value = ''
  if (files.length) void log.addFiles(files)
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-20 bg-header shadow-[0_0_4px_var(--shadow)]">
      <div class="flex min-h-[49px] items-center justify-between gap-3 px-3 sm:px-5">
        <div class="flex min-w-0 items-center gap-3">
          <a href="#/" class="flex shrink-0 items-center gap-1.5 rounded-[5px] bg-surface py-[3px] pr-2 pl-[3px] text-white-ink hover:no-underline">
            <img src="/favicon.svg" alt="" class="size-6" />
            <span class="hidden text-[15px] sm:inline">packets</span>
          </a>
          <nav class="flex h-[49px]" aria-label="Pages">
            <a
              v-for="item in NAV"
              :key="item.route"
              :href="item.href"
              :aria-current="route === item.route ? 'page' : undefined"
              class="flex items-center px-2.5 text-ink-2 hover:text-white-ink hover:no-underline sm:px-3"
              :class="route === item.route && 'text-white-ink shadow-[inset_0_-3px_0_var(--orange)]'"
            >
              {{ item.label }}
            </a>
          </nav>
        </div>

        <div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <template v-if="route === 'overview' && log.summary.value">
            <span class="hidden truncate text-ink-3 lg:block" :title="log.summary.value.files.map((f) => f.name).join('\n')">{{ fileSummary }}</span>
            <button type="button" class="hidden cursor-pointer rounded-[5px] bg-surface px-2.5 py-1 whitespace-nowrap sm:block text-ink-2 hover:bg-surface-2 hover:text-white-ink" @click="fileInput?.click()">
              add files
            </button>
            <button type="button" class="cursor-pointer rounded-[5px] px-2.5 py-1 text-ink-2 hover:bg-surface-2 hover:text-white-ink" @click="log.reset()">close</button>
            <input ref="fileInput" type="file" accept=".sqlite,.sqlite3,.db" multiple class="hidden" @change="onPick" />
          </template>
          <button
            type="button"
            class="cursor-pointer rounded-[5px] p-1.5 text-ink-2 hover:bg-surface-2 hover:text-white-ink"
            :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            :title="theme === 'dark' ? 'light theme' : 'dark theme'"
            @click="toggle"
          >
            <svg v-if="theme === 'dark'" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
            <svg v-else class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1600px] flex-1 px-3 pt-3 sm:px-5">
      <OverviewPage v-if="route === 'overview'" :log="log" />
      <ComparePage v-else :cmp="cmp" />
    </main>

    <footer class="px-4 py-6 text-center text-ink-3">
      built for <a href="https://github.com/DebitCardz/packet-logger">packet-logger</a>
    </footer>
  </div>
</template>
