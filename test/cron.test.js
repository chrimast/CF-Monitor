import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cronMatches,
  DEFAULT_CRON_HOURLY,
  DEFAULT_CRON_OFFLINE_ALERT,
  HOURLY_INTERVAL_OPTIONS,
  intervalToCron,
  normalizeCronExpression,
  OFFLINE_INTERVAL_OPTIONS,
  parseCronInterval
} from '../src/frontend/utils/cron.js'

test('normalizeCronExpression keeps valid five-field expressions and falls back otherwise', () => {
  assert.equal(normalizeCronExpression('*/5 * * * *'), '*/5 * * * *')
  assert.equal(normalizeCronExpression('  0   12 * * * '), '0 12 * * *')
  assert.equal(normalizeCronExpression(''), DEFAULT_CRON_OFFLINE_ALERT)
  assert.equal(normalizeCronExpression('not a cron', DEFAULT_CRON_HOURLY), DEFAULT_CRON_HOURLY)
  assert.equal(normalizeCronExpression('0 * * *'), DEFAULT_CRON_OFFLINE_ALERT)
})

test('cronMatches evaluates minute and hourly expressions against UTC time', () => {
  const noon = new Date('2026-10-20T12:00:00Z')
  const noonFive = new Date('2026-10-20T12:05:00Z')
  assert.equal(cronMatches('*/1 * * * *', noon), true)
  assert.equal(cronMatches('*/5 * * * *', noon), true)
  assert.equal(cronMatches('*/5 * * * *', noonFive), true)
  assert.equal(cronMatches('*/5 * * * *', new Date('2026-10-20T12:01:00Z')), false)
  assert.equal(cronMatches('0 * * * *', noon), true)
  assert.equal(cronMatches('0 * * * *', noonFive), false)
  assert.equal(cronMatches('0 12 * * *', noon), true)
  assert.equal(cronMatches('0 13 * * *', noon), false)
})

test('intervalToCron and parseCronInterval convert readable intervals', () => {
  assert.equal(intervalToCron({ every: 1, unit: 'minute' }), '*/1 * * * *')
  assert.equal(intervalToCron({ every: 5, unit: 'minute' }), '*/5 * * * *')
  assert.equal(intervalToCron({ every: 1, unit: 'hour' }), '0 * * * *')
  assert.equal(intervalToCron({ every: 6, unit: 'hour' }), '0 */6 * * *')
  assert.deepEqual(parseCronInterval('*/5 * * * *'), { every: 5, unit: 'minute' })
  assert.deepEqual(parseCronInterval('0 */6 * * *'), { every: 6, unit: 'hour' })
  assert.deepEqual(parseCronInterval('0 * * * *'), { every: 1, unit: 'hour' })
  assert.equal(OFFLINE_INTERVAL_OPTIONS.some((item) => item.every === 5 && item.unit === 'minute'), true)
  assert.equal(HOURLY_INTERVAL_OPTIONS.some((item) => item.every === 6 && item.unit === 'hour'), true)
})

{
  const fs = await import('node:fs')
  const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  const settings = fs.readFileSync(new URL('../src/utils/settings.js', import.meta.url), 'utf8')
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  const panel = fs.readFileSync(new URL('../src/frontend/views/admin/components/SettingsPanel.vue', import.meta.url), 'utf8')
  assert.match(wrangler, /\[triggers\]/)
  assert.match(wrangler, /crons = \["\*\/1 \* \* \* \*"\]/)
  assert.doesNotMatch(wrangler, /# \[triggers\]/)
  assert.match(settings, /cron_offline_alert/)
  assert.match(settings, /cron_hourly/)
  assert.match(index, /cronMatches/)
  assert.match(index, /cron_offline_alert/)
  assert.match(index, /cron_hourly/)
  assert.match(panel, /cron_offline_alert/)
  assert.match(panel, /cron_hourly/)
  assert.match(panel, /offlineCronPreset/)
  assert.match(panel, /hourlyCronPreset/)
  assert.match(panel, /<select/)
}
