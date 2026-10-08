import type { DirectionFilter, Metric } from './types'

export const DIRECTIONS = [
  { value: 'all', label: 'all' },
  { value: 'in', label: 'incoming' },
  { value: 'out', label: 'outgoing' },
] as const satisfies readonly { value: DirectionFilter; label: string }[]

export const METRICS = [
  { value: 'amount', label: 'count' },
  { value: 'bytes', label: 'size' },
] as const satisfies readonly { value: Metric; label: string }[]
