import { onBeforeUnmount, onMounted, ref } from 'vue'

const TOKENS = {
  surface: '--surface-1',
  tooltip: '--bg-header',
  text: '--text-primary',
  white: '--text-white',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  grid: '--grid',
  border: '--border',
  other: '--series-other',
  before: '--before',
  orange: '--orange',
  good: '--green',
  bad: '--red',
} as const

export interface ThemeColors extends Record<keyof typeof TOKENS, string> {
  series: string[]
}

function read(): ThemeColors {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string) => style.getPropertyValue(name).trim()
  const entries = Object.entries(TOKENS).map(([key, token]) => [key, get(token)])
  return {
    ...(Object.fromEntries(entries) as Record<keyof typeof TOKENS, string>),
    series: Array.from({ length: 8 }, (_, i) => get(`--series-${i + 1}`)),
  }
}

/** Chart.js draws on canvas, so it needs resolved colours that follow light/dark mode. */
export function useThemeColors() {
  const colors = ref<ThemeColors>(read())
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const update = () => (colors.value = read())
  const observer = new MutationObserver(update)

  onMounted(() => {
    media.addEventListener('change', update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  })
  onBeforeUnmount(() => {
    media.removeEventListener('change', update)
    observer.disconnect()
  })

  return colors
}
