<template>
  <section class="latency-overview" aria-label="Latency">
    <label>{{ zh ? '线路' : 'Route' }}
      <select v-model="selectedRoute">
        <option value="">{{ zh ? '全部线路' : 'All routes' }}</option>
        <option v-for="route in availableRoutes" :key="route.key" :value="route.key">{{ route.label }}</option>
      </select>
    </label>
    <p v-if="!rows.length">{{ zh ? '暂无延迟样本' : 'No latency samples' }}</p>
    <article v-for="row in rows" :key="row.server.id" class="latency-node">
      <h3>{{ row.server.name }}</h3>
      <div v-for="route in row.routes" :key="route.key" class="latency-route">
        <div class="latency-heading"><strong>{{ route.label }}</strong><span>RTT {{ text(route.ping, 'ms') }} · {{ zh ? '丢包' : 'Loss' }} {{ text(route.loss, '%') }}</span></div>
        <div v-if="route.points.length" class="latency-timeline">
          <span v-for="point in route.points" :key="point.ts" class="latency-sample" :title="`${time(point.ts)} · RTT ${text(point.ping, 'ms')} · Loss ${text(point.loss, '%')}`" :style="{ left: position(point.ts, route.points) + '%' }">
            <i :class="point.ping.state" :style="{ height: pingHeight(point.ping, route.points) + '%' }"></i>
            <b :class="point.loss.state" :style="{ height: Math.max(5, point.loss.value ?? 0) + '%' }"></b>
          </span>
        </div>
        <div v-if="route.points.length" class="latency-time"><time>{{ time(route.points[0].ts) }}</time><time>{{ time(route.points.at(-1).ts) }}</time></div>
        <small v-else>{{ zh ? '暂无公开历史样本' : 'No public history samples' }}</small>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { currentLang } from '../utils/i18n.js'
import { buildLatencyRoutes } from '../utils/publicLatency.js'
const props = defineProps({ servers: { type: Array, default: () => [] }, sysConfig: { type: Object, default: () => ({}) } })
const selectedRoute = ref('')
const zh = computed(() => currentLang.value === 'zh')
const allRows = computed(() => props.servers.map(server => ({ server, routes: buildLatencyRoutes(server, props.sysConfig) })))
const availableRoutes = computed(() => [...new Map(allRows.value.flatMap(r => r.routes).map(r => [r.key, r])).values()])
const rows = computed(() => allRows.value.map(row => ({ ...row, routes: row.routes.filter(r => !selectedRoute.value || r.key === selectedRoute.value) })).filter(r => r.routes.length))
const text = (value, unit) => value.state === 'timeout' ? (zh.value ? '超时' : 'Timeout') : value.state === 'missing' ? '—' : `${value.value} ${unit}`
const time = ts => new Date(ts).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
const position = (ts, points) => points.length === 1 ? 50 : (ts - points[0].ts) / Math.max(1, points.at(-1).ts - points[0].ts) * 100
const pingHeight = (ping, points) => ping.state === 'value' ? Math.max(5, ping.value / Math.max(1, ...points.map(p => p.ping.value ?? 0)) * 100) : 20
</script>

<style scoped>
.latency-overview { display: grid; gap: 16px; }
.latency-overview select { margin-left: 8px; padding: 6px; color: inherit; background: var(--bg-card, #20242a); border: 1px solid var(--border-color, #555); border-radius: 6px; }
.latency-node { padding: 16px; border: 1px solid var(--border-color, #555); border-radius: 10px; background: var(--bg-card); min-width: 0; }
.latency-node h3 { margin: 0 0 12px; overflow-wrap: anywhere; }
.latency-route + .latency-route { margin-top: 16px; }
.latency-heading, .latency-time { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.latency-timeline { position: relative; height: 64px; margin: 10px 6px 4px; border-bottom: 1px solid var(--border-color, #555); }
.latency-sample { position: absolute; height: 100%; width: 6px; bottom: 0; transform: translateX(-50%); display: flex; gap: 1px; align-items: flex-end; }
.latency-sample i, .latency-sample b { width: 3px; background: var(--accent-green, #4b9); min-height: 3px; }
.latency-sample b { background: var(--accent-blue, #49d); }
.latency-sample .timeout { background: var(--accent-red, #d65); }
.latency-sample .missing { visibility: hidden; }
.latency-time, small { font-size: 11px; opacity: .7; }
</style>
