import type { ThemeColors } from '../composables/useThemeColors'

/** Shared tooltip look: dark panel, bright text so values are easy to read. */
export function tooltipStyle(c: ThemeColors) {
  return {
    backgroundColor: c.tooltip,
    titleColor: c.white,
    bodyColor: c.white,
    footerColor: c.white,
    borderColor: c.border,
    borderWidth: 1,
    padding: 10,
    boxPadding: 4,
    titleFont: { size: 12, weight: 'bold' as const },
    bodyFont: { size: 12 },
    footerFont: { size: 12, weight: 'bold' as const },
  }
}
