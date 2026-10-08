import { ref, watch } from 'vue'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'packet-viewer-theme'

function stored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Dark by default like spark; the choice is remembered per browser. */
const theme = ref<Theme>(stored())

watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
  },
  { immediate: true },
)

export function useTheme() {
  return {
    theme,
    toggle: () => (theme.value = theme.value === 'dark' ? 'light' : 'dark'),
  }
}
