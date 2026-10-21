export const DEFAULT_CRON_OFFLINE_ALERT = '*/1 * * * *'
export const DEFAULT_CRON_HOURLY = '0 * * * *'
export const OFFLINE_INTERVAL_OPTIONS = [
  { every: 1, unit: 'minute' },
  { every: 2, unit: 'minute' },
  { every: 5, unit: 'minute' },
  { every: 10, unit: 'minute' },
  { every: 15, unit: 'minute' },
  { every: 30, unit: 'minute' }
]
export const HOURLY_INTERVAL_OPTIONS = [
  { every: 1, unit: 'hour' },
  { every: 2, unit: 'hour' },
  { every: 3, unit: 'hour' },
  { every: 6, unit: 'hour' },
  { every: 12, unit: 'hour' },
  { every: 24, unit: 'hour' }
]

export function intervalKey(interval) {
  return `${Number(interval?.every) || 1}-${interval?.unit === 'hour' ? 'hour' : 'minute'}`
}

export function intervalToCron(interval) {
  const every = Math.max(1, Number(interval?.every) || 1)
  if (interval?.unit === 'hour') {
    return every === 1 ? '0 * * * *' : `0 */${every} * * *`
  }
  return every === 1 ? '*/1 * * * *' : `*/${every} * * * *`
}

export function parseCronInterval(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ')
  let match = raw.match(/^\*\/(\d+) \* \* \* \*$/)
  if (match) return { every: Number(match[1]), unit: 'minute' }
  if (raw === '0 * * * *') return { every: 1, unit: 'hour' }
  match = raw.match(/^0 \*\/(\d+) \* \* \*$/)
  if (match) return { every: Number(match[1]), unit: 'hour' }
  return null
}

const FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6]
]

function isValidField(part, min, max) {
  if (!part) return false
  return part.split(',').every((token) => {
    const match = token.match(/^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/)
    if (!match) return false
    const step = match[3] ? Number(match[3]) : 1
    if (!Number.isInteger(step) || step < 1) return false
    if (token.startsWith('*')) return true
    const start = Number(match[1])
    const end = match[2] == null ? start : Number(match[2])
    return Number.isInteger(start) && Number.isInteger(end) && start >= min && end <= max && start <= end
  })
}

export function isValidCronExpression(value) {
  const parts = String(value || '').trim().split(/\s+/)
  return parts.length === 5 && parts.every((part, index) => isValidField(part, FIELD_RANGES[index][0], FIELD_RANGES[index][1]))
}

export function normalizeCronExpression(value, fallback = DEFAULT_CRON_OFFLINE_ALERT) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ')
  return isValidCronExpression(raw) ? raw : fallback
}

function fieldMatches(part, value, min, max) {
  return part.split(',').some((token) => {
    const [range, stepRaw] = token.split('/')
    const step = stepRaw ? Number(stepRaw) : 1
    if (!Number.isInteger(step) || step < 1) return false
    let start
    let end
    if (range === '*') {
      start = min
      end = max
    } else if (range.includes('-')) {
      const bounds = range.split('-').map(Number)
      start = bounds[0]
      end = bounds[1]
    } else {
      start = Number(range)
      end = start
    }
    if (value < start || value > end) return false
    return (value - start) % step === 0
  })
}

export function cronMatches(expr, date = new Date()) {
  const normalized = normalizeCronExpression(expr, '')
  if (!normalized) return false
  const parts = normalized.split(' ')
  const values = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay()
  ]
  return parts.every((part, index) => fieldMatches(part, values[index], FIELD_RANGES[index][0], FIELD_RANGES[index][1]))
}
