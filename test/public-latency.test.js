import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLatencyRoutes } from '../src/frontend/utils/publicLatency.js'

test('public latency keeps timeout, absent and zero loss distinct for all routes', () => {
  const routes = buildLatencyRoutes({ ping_ct: null, loss_ct: 100, ping_cu: false, ping_cm: '23.5', loss_cm: '0', ping_bd: 0, ping_node_4: 8, node_4_name: 'Tokyo' })
  assert.deepEqual(routes.map(r => r.key), ['ct', 'cm', 'node_4'])
  assert.equal(routes[0].ping.state, 'timeout')
  assert.equal(routes[1].loss.value, 0)
  assert.equal(routes[2].label, 'Tokyo')
})

test('public latency windows join exact timestamps without fabricated or carried values', () => {
  const server = { ping: [{ ts: 1700000000123, ct: null }, { ts: 1700000000999, ct: 25 }], loss: [{ ts: 1700000000777, ct: 0 }] }
  assert.equal(buildLatencyRoutes(server).length, 0)
  const [route] = buildLatencyRoutes(server, { show_three_net_details: true })
  assert.deepEqual(route.points.map(p => p.ts), [1700000000123, 1700000000777, 1700000000999])
  assert.equal(route.points[0].ping.state, 'timeout')
  assert.equal(route.points[1].ping.state, 'missing')
  assert.equal(route.points[1].loss.value, 0)
  assert.equal(route.points[2].loss.state, 'missing')
})

test('overview is wired to existing filtered public nodes without additional fetching', async () => {
  const { readFile } = await import('node:fs/promises')
  const dashboard = await readFile(new URL('../src/frontend/views/Dashboard.vue', import.meta.url), 'utf8')
  assert.match(dashboard, /switchView\('latency'\)/)
  assert.match(dashboard, /<LatencyOverview\s+v-if="currentView === 'latency'"\s+:servers="filteredServers"\s+:sys-config="sysConfig"/)
  const component = await readFile(new URL('../src/frontend/components/LatencyOverview.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(component, /\bfetch\s*\(/)
  assert.match(component, /buildLatencyRoutes/)
})
