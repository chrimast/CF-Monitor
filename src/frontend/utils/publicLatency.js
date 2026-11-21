const routeLabels = { ct: 'CT', cu: 'CU', cm: 'CM', bd: 'BGP', node_1: 'Node 1', node_2: 'Node 2', node_3: 'Node 3', node_4: 'Node 4' }
const missing = { state: 'missing', value: null }
function probe(value, loss = false) {
  if (value === null && !loss) return { state: 'timeout', value: null }
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return missing
  const n = Number(value)
  return Number.isFinite(n) && (loss ? n >= 0 && n <= 100 : n > 0)
    ? { state: 'value', value: n } : missing
}

export function buildLatencyRoutes(server, config = {}) {
  const window = field => new Map((config.show_three_net_details === true && Array.isArray(server[field]) ? server[field] : [])
    .filter(p => p && Number.isSafeInteger(Number(p.ts ?? p.timestamp)) && Number(p.ts ?? p.timestamp) > 0)
    .map(p => [Number(p.ts ?? p.timestamp), p]))
  const pings = window('ping')
  const losses = window('loss')
  const timestamps = [...new Set([...pings.keys(), ...losses.keys()])].sort((a, b) => a - b)
  return Object.entries(routeLabels).map(([key, fallback]) => {
    const labelKey = key.startsWith('node_') ? `${key}_name` : `custom_${key}_name`
    return {
      key,
      label: server[labelKey] || config[labelKey] || fallback,
      ping: probe(server[`ping_${key}`]),
      loss: probe(server[`loss_${key}`], true),
      points: timestamps.map(ts => ({ ts, ping: probe(pings.get(ts)?.[key]), loss: probe(losses.get(ts)?.[key], true) }))
    }
  }).filter(r => r.ping.state !== 'missing' || r.loss.state !== 'missing' || r.points.some(p => p.ping.state !== 'missing' || p.loss.state !== 'missing'))
}
