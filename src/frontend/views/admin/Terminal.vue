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
    <div class="workspace-term-body">
      <div ref="termEl" class="workspace-term-screen"></div>
      <aside class="workspace-files">
        <div class="workspace-files-toolbar">
          <button class="workspace-files-btn" :disabled="busy" @click="goParent">上级</button>
          <button class="workspace-files-btn" :disabled="busy" @click="reloadDir">刷新</button>
          <button class="workspace-files-btn" :disabled="busy" @click="makeDir">新建目录</button>
          <label class="workspace-files-btn">
            上传
            <input type="file" multiple hidden :disabled="busy" @change="uploadFiles">
          </label>
        </div>
        <div class="workspace-files-path" :title="cwd">{{ cwd }}</div>
        <p v-if="fileError" class="workspace-files-error">{{ fileError }}</p>
        <ul class="workspace-files-list">
          <li
            v-for="entry in entries"
            :key="entry.path"
            :class="{ dir: entry.is_dir }"
            @dblclick="openEntry(entry)"
          >
            <button class="workspace-files-name" @click="openEntry(entry)">
              {{ entry.is_dir ? '📁' : '📄' }} {{ entry.name }}
            </button>
            <span class="workspace-files-meta">{{ formatSize(entry) }}</span>
            <button v-if="!entry.is_dir" class="workspace-files-mini" @click.stop="downloadEntry(entry)">下载</button>
            <button class="workspace-files-mini danger" @click.stop="removeEntry(entry)">删</button>
          </li>
        </ul>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { STORAGE } from '../../utils/constants'
import { getWsBase, getApiBases } from '../../utils/config'

const route = useRoute()
const termEl = ref(null)
const status = ref('connecting')
const cwd = ref('/')
const entries = ref([])
const fileError = ref('')
const busy = ref(false)
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
let terminalDisabled = false
let reqSeq = 0
const pending = new Map()

const wsUrl = () => {
  const token = localStorage.getItem(STORAGE.JWT_TOKEN) || ''
  const url = new URL('/api/term', getWsBase() || window.location.origin.replace(/^http/, 'ws'))
  url.searchParams.set('id', String(route.params.id || ''))
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

const send = (payload) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

const sendResize = () => {
  if (!term) return
  fit?.fit()
  send({ type: 'resize', cols: term.cols, rows: term.rows })
}

const nextId = () => `fs${++reqSeq}`

const waitReply = (id, timeoutMs = 20000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    pending.delete(id)
    reject(new Error('文件操作超时'))
  }, timeoutMs)
  pending.set(id, { resolve, reject, timer })
})

const requestFS = async (payload) => {
  const id = payload.id || nextId()
  send({ ...payload, id })
  return waitReply(id)
}

const parentPath = (path) => {
  if (!path || path === '/') return '/'
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx <= 0 ? '/' : trimmed.slice(0, idx)
}

const joinPath = (dir, name) => {
  if (dir === '/') return `/${name}`
  return `${dir.replace(/\/+$/, '')}/${name}`
}

const bytesToBase64 = (bytes) => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const base64ToBytes = (data) => {
  const binary = atob(data || '')
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

const formatSize = (entry) => {
  if (entry.is_dir) return '目录'
  const size = Number(entry.size || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const reloadDir = async (path = cwd.value) => {
  if (status.value !== 'ready') return
  busy.value = true
  fileError.value = ''
  try {
    const reply = await requestFS({ type: 'fs_list', path })
    if (reply.type === 'fs_error') throw new Error(reply.error || '列出失败')
    cwd.value = reply.path || path
    entries.value = reply.entries || []
  } catch (e) {
    fileError.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

const goParent = () => reloadDir(parentPath(cwd.value))

const openEntry = (entry) => {
  if (entry.is_dir) reloadDir(entry.path)
}

const makeDir = async () => {
  const name = window.prompt('新目录名')
  if (!name) return
  busy.value = true
  try {
    const reply = await requestFS({ type: 'fs_mkdir', path: joinPath(cwd.value, name.trim()) })
    if (reply.type === 'fs_error') throw new Error(reply.error || '创建失败')
    await reloadDir()
  } catch (e) {
    fileError.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

const removeEntry = async (entry) => {
  if (!window.confirm(`删除 ${entry.path} ?`)) return
  busy.value = true
  try {
    const reply = await requestFS({ type: 'fs_rm', path: entry.path })
    if (reply.type === 'fs_error') throw new Error(reply.error || '删除失败')
    await reloadDir()
  } catch (e) {
    fileError.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

const downloadEntry = async (entry) => {
  busy.value = true
  fileError.value = ''
  try {
    const chunks = []
    let offset = 0
    while (true) {
      const reply = await requestFS({ type: 'fs_read', path: entry.path, offset, length: 24576 })
      if (reply.type === 'fs_error') throw new Error(reply.error || '下载失败')
      chunks.push(base64ToBytes(reply.data || ''))
      offset += chunks[chunks.length - 1].length
      if (reply.eof) break
    }
    const blob = new Blob(chunks)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = entry.name
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    fileError.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

const uploadFiles = async (event) => {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  busy.value = true
  fileError.value = ''
  try {
    for (const file of files) {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const path = joinPath(cwd.value, file.name)
      const chunkSize = 18000
      if (buffer.length === 0) {
        const reply = await requestFS({ type: 'fs_write', path, offset: 0, data: '', eof: true })
        if (reply.type === 'fs_error') throw new Error(reply.error || '上传失败')
        continue
      }
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const slice = buffer.subarray(offset, offset + chunkSize)
        const reply = await requestFS({
          type: 'fs_write',
          path,
          offset,
          data: bytesToBase64(slice),
          eof: offset + slice.length >= buffer.length
        })
        if (reply.type === 'fs_error') throw new Error(reply.error || '上传失败')
      }
    }
    await reloadDir()
  } catch (e) {
    fileError.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

const handleFSMessage = (msg) => {
  const waiter = pending.get(msg.id)
  if (!waiter) return
  clearTimeout(waiter.timer)
  pending.delete(msg.id)
  waiter.resolve(msg)
}

const disableTerminal = () => {
  if (terminalDisabled) return
  const id = String(route.params.id || '').trim()
  if (!id) return
  terminalDisabled = true
  const token = localStorage.getItem(STORAGE.JWT_TOKEN) || ''
  const base = getApiBases()[0] || window.location.origin
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    fetch(`${base}/admin/api/terminal`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, enabled: false }),
      keepalive: true,
      credentials: 'include'
    })
  } catch (_) {}
}

onMounted(() => {
  window.addEventListener('pagehide', disableTerminal)
  window.addEventListener('beforeunload', disableTerminal)
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
  window.addEventListener('resize', sendResize)
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
      reloadDir(cwd.value)
    } else if (String(msg.type || '').startsWith('fs_')) {
      handleFSMessage(msg)
    } else if (msg.type === 'waiting' || msg.type === 'agent_offline') {
      if (status.value !== 'waiting') {
        status.value = 'waiting'
        term.write('\r\n[waiting for agent]\r\n')
      }
    } else if (msg.type === 'exit' || msg.type === 'error') {
      status.value = 'waiting'
      term.write(`\r\n[${msg.data || msg.message || msg.type}]\r\n`)
    }
  }
  socket.onclose = () => { status.value = 'closed' }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', sendResize)
  window.removeEventListener('pagehide', disableTerminal)
  window.removeEventListener('beforeunload', disableTerminal)
  disableTerminal()
  try { socket?.close() } catch (_) {}
  try { term?.dispose() } catch (_) {}
})
</script>
