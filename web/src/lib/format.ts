const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat()

export const formatCount = (n: number) => (Math.abs(n) < 10_000 ? whole.format(Math.round(n)) : compact.format(n))
export const formatExactCount = (n: number) => whole.format(Math.round(n))

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** Decimal units, matching the MB figures in the Python script. */
export function formatBytes(bytes: number, digits = 1): string {
  let value = bytes
  let unit = 0
  while (Math.abs(value) >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000
    unit++
  }
  return `${value.toFixed(unit === 0 ? 0 : digits)} ${BYTE_UNITS[unit]}`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}

export function formatPercent(fraction: number): string {
  if (fraction > 0 && fraction < 0.001) return '<0.1%'
  return `${(fraction * 100).toFixed(1)}%`
}

export function formatBucketLabel(ms: number, bucketMs: number, spansDays: boolean): string {
  const date = new Date(ms)
  const options: Intl.DateTimeFormatOptions =
    bucketMs >= 86_400_000
      ? { month: 'short', day: 'numeric' }
      : {
          hour: '2-digit',
          minute: '2-digit',
          ...(bucketMs < 60_000 ? { second: '2-digit' } : {}),
          ...(spansDays ? { month: 'short', day: 'numeric' } : {}),
        }
  return date.toLocaleString(undefined, options)
}

/** "1,234/s" for packets, "12.3 KB/s" for data. */
export function formatRate(perSecond: number, metric: 'amount' | 'bytes'): string {
  if (metric === 'bytes') return `${formatBytes(perSecond)}/s`
  if (perSecond === 0) return '0/s'
  return `${perSecond < 10 ? perSecond.toFixed(2) : formatCount(perSecond)}/s`
}

/** Signed relative change, e.g. "+12.5%" or "-40.0%". */
export function formatChange(change: number): string {
  const pct = change * 100
  const digits = Math.abs(pct) >= 100 ? 0 : 1
  return `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${Math.abs(pct).toFixed(digits)}%`
}

/** Elapsed time since the start of a recording, e.g. "0:05" (h:mm) or "2:30" (m:ss). */
export function formatElapsed(ms: number, withSeconds: boolean): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return withSeconds ? `${h ? `${h}:${pad(m)}` : m}:${pad(s)}` : `${h}:${pad(m)}`
}
