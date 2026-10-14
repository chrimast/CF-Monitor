<template>
  <div class="workspace-term">
    <header class="workspace-term-bar">
      <div class="workspace-term-brand">
        <span class="brand-mark" aria-hidden="true">&gt;_</span>
        <strong>CF</strong><span>Monitor</span>
      </div>
      <p class="workspace-term-host">{{ title }}</p>
      <span class="workspace-term-status" :data-state="status">{{ statusText }}</span>
      <a class="workspace-term-back" href="/admin#/admin">返回后台</a>
    </header>
    <div ref="termEl" class="workspace-term-screen"></div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { STORAGE } from '../../utils/constants'
import { getApiBases } from '../../utils/config'

const route = useRoute()
const termEl = ref(null)
const status = ref('connecting')
const title = computed(() => route.params.id || 'terminal')
const statusText = computed(() => {
  if (status.value === 'ready') return '已连接'
  if (status.value === 'waiting') return '等待探针'
  if (status.value === 'closed') return '已断开'
  return '连接中'
})

let term
let fit
let socket
let resizeObserver

const wsUrl = () => {
  const token = localStorage.getItem(STORAGE.JWT_TOKEN) || ''
  const base = getApiBases()[0] || window.location.origin
  const url = new URL('/api/term', base.replace(/^http/, 'ws'))
  url.searchParams.set('id', String(route.params.id || ''))
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

const send = (payload) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

onMounted(() => {
  term = new Terminal({
    cursorBlink: true,
    fontFamily: '"Cascadia Code", Consolas, "JetBrains Mono", monospace',
    fontSize: 13,
    theme: {
      background: '#080b10',
      foreground: '#e8edf5',
      cursor: '#f4511e',
      selectionBackground: '#f4511e55'
    }
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(termEl.value)
  fit.fit()
  term.onData((data) => send({ type: 'input', data }))
  window.addEventListener('resize', () => {
    fit?.fit()
    send({ type: 'resize', cols: term.cols, rows: term.rows })
  })
  socket = new WebSocket(wsUrl())
  socket.onopen = () => {
    status.value = 'waiting'
    send({ type: 'open', cols: term.cols, rows: term.rows })
  }
  socket.onmessage = (event) => {
    let msg
    try { msg = JSON.parse(event.data) } catch { return }
    if (msg.type === 'data') {
      term.write(msg.data || '')
      status.value = 'ready'
    } else if (msg.type === 'ready' || msg.type === 'agent_online') {
      status.value = 'ready'
      send({ type: 'open', cols: term.cols, rows: term.rows })
    } else if (msg.type === 'waiting' || msg.type === 'agent_offline') {
      status.value = 'waiting'
      term.write('\r\n[waiting for agent]\r\n')
    } else if (msg.type === 'exit' || msg.type === 'error') {
      status.value = 'closed'
      term.write(`\r\n[${msg.message || msg.type}]\r\n`)
    }
  }
  socket.onclose = () => { status.value = 'closed' }
})

onBeforeUnmount(() => {
  try { socket?.close() } catch (_) {}
  try { term?.dispose() } catch (_) {}
  window.removeEventListener('resize', () => {})
})
</script>
