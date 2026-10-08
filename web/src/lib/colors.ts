import type { ThemeColors } from '../composables/useThemeColors'

/** Packets with a colour slot get that categorical hue; everything else is the neutral "Other". */
export function colorFor(name: string, slots: Map<string, number>, colors: ThemeColors): string {
  const slot = slots.get(name)
  return slot === undefined ? colors.other : (colors.series[slot] ?? colors.other)
}
