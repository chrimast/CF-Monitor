<template>
  <div id="tab-dnshub" class="tab-content" :class="{ active: activeTab === 'dnshub' }">
    <div v-if="page === 'home'" class="dnshub-home">
      <p v-if="error" class="text-sm mb-2" style="color: var(--accent-red)">{{ error }}</p>
      <div class="dnshub-split">
        <div class="settings-section">
          <div class="section-title"><span>▸</span> {{ trans.dnshubAccounts }}</div>
          <form class="dnshub-compact-grid" @submit.prevent="saveAccount">
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubAccountName }}</label>
              <input v-model="accountForm.name" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubProvider }}</label>
              <select v-model="accountForm.provider" class="form-select" @change="resetCredentials">
                <option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
              </select>
            </div>
            <div v-for="field in currentFields" :key="field.id" class="form-group">
              <label class="form-label">{{ field.label }}</label>
              <input
                v-model="accountForm.credentials[field.id]"
                class="form-input"
                :type="field.type || 'text'"
                :placeholder="editingAccountId ? trans.dnshubKeepCredential : (field.placeholder || '')"
              >
            </div>
            <div class="form-group dnshub-actions">
              <button class="btn btn-primary" type="submit" :disabled="loading">{{ editingAccountId ? trans.dnshubSaveAccount : trans.dnshubAddAccount }}</button>
              <button v-if="editingAccountId" class="btn" type="button" @click="cancelEditAccount">{{ trans.dnshubCancelEdit }}</button>
            </div>
          </form>

          <div class="dnshub-account-list">
            <div v-if="!accounts.length" class="text-muted">{{ trans.dnshubNoAccounts }}</div>
            <div v-for="item in accounts" :key="item.id" class="dnshub-account-row">
              <button class="dnshub-account-name" type="button" @click="useAccount(item)">
                <strong>{{ item.name }}</strong>
                <span class="text-muted text-sm">{{ providerName(item.provider) }}</span>
              </button>
              <div class="header-actions">
                <button class="btn" type="button" @click="openDomains(item)">{{ trans.dnshubOpenDomains }}</button>
                <button class="btn" type="button" @click="startEditAccount(item)">{{ trans.edit || '编辑' }}</button>
                <button class="btn btn-red" type="button" @click="removeAccount(item)">{{ trans.delete || '删除' }}</button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="section-title"><span>▸</span> {{ trans.dnshubOptimize }}</div>
          <p class="text-muted dnshub-hint">{{ trans.dnshubOptimizeHint }}</p>
          <form class="dnshub-compact-grid" @submit.prevent="applyOptimize">
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubAccountId }}</label>
              <select v-model="optimize.accountId" class="form-select">
                <option v-for="item in accounts" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubDomains }}</label>
              <input v-model="optimize.domain" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubDomainId }}</label>
              <input v-model="optimize.domainId" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubHost }}</label>
              <input v-model="optimize.name" class="form-input" required placeholder="@">
            </div>
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubCdn }}</label>
              <select v-model="optimize.cdnType" class="form-select">
                <option value="1">Cloudflare</option>
                <option value="2">CloudFront</option>
                <option value="3">Gcore</option>
                <option value="4">EdgeOne</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubIpType }}</label>
              <select v-model="optimize.ipType" class="form-select">
                <option value="v4">IPv4</option>
                <option value="v6">IPv6</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubRecordNum }}</label>
              <input v-model.number="optimize.recordNum" class="form-input" type="number" min="1" max="5">
            </div>
            <div class="form-group">
              <label class="form-label">TTL</label>
              <input v-model.number="optimize.ttl" class="form-input" type="number" min="1">
            </div>
            <div class="form-group">
              <label class="form-label">{{ trans.dnshubIntervalHours }}</label>
              <input v-model.number="optimize.intervalHours" class="form-input" type="number" min="1" max="168">
            </div>
            <div class="form-group dnshub-actions">
              <button class="btn" type="button" @click="previewOptimize">{{ trans.dnshubPreview }}</button>
              <button class="btn btn-primary" type="submit">{{ trans.dnshubApply }}</button>
              <button class="btn" type="button" @click="saveOptimizeJob">{{ trans.dnshubSaveJob }}</button>
            </div>
          </form>
          <pre v-if="optimizeResult" class="dnshub-result">{{ optimizeResult }}</pre>
          <div class="section-title" style="margin-top:12px">{{ trans.dnshubOptimizeJobs }}</div>
          <p class="dnshub-hint">{{ trans.dnshubOptimizeCronHint }}</p>
          <div v-if="!optimizeJobs.length" class="text-muted">{{ trans.dnshubNoJobs }}</div>
          <div v-for="job in optimizeJobs" :key="job.id" class="dnshub-domain-row">
            <label><input type="checkbox" :checked="job.enabled" @change="toggleOptimizeJob(job)"> {{ job.name }}.{{ job.domain }}</label>
            <span class="text-sm">{{ job.intervalHours }}h</span>
            <span class="text-muted text-sm">{{ job.lastResult || trans.dnshubNeverRun }}</span>
            <button class="btn" type="button" @click="runOptimizeJob(job)">{{ trans.dnshubRunNow }}</button>
            <button class="btn btn-red" type="button" @click="removeOptimizeJob(job)">{{ trans.delete || '删除' }}</button>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="page === 'domains'" class="settings-section">
      <p v-if="error" class="text-sm mb-2" style="color: var(--accent-red)">{{ error }}</p>
      <div class="section-title">
        <span>▸</span>
        <button class="btn" type="button" @click="goHome">{{ trans.dnshubBack }}</button>
        {{ account?.name }} · {{ trans.dnshubDomains }}
      </div>
      <form class="dnshub-domain-toolbar" @submit.prevent="addDomain">
        <input v-model="domainNew" class="form-input" :placeholder="trans.dnshubAddDomain">
        <button class="btn btn-primary" type="submit">{{ trans.dnshubAddDomain }}</button>
        <input v-model="domainQuery" class="form-input" :placeholder="trans.dnshubSearchDomain" @keydown.enter.prevent="loadDomains">
        <button class="btn" type="button" @click="loadDomains">{{ trans.refresh }}</button>
      </form>
      <div class="dnshub-domain-table mt-3">
        <div class="dnshub-domain-head">
          <span>{{ trans.dnshubDomains }}</span>
          <span>{{ trans.dnshubRecords }}</span>
          <span>ID</span>
          <span></span>
        </div>
        <div v-if="!domains.length" class="dnshub-domain-empty">{{ trans.dnshubNoDomains }}</div>
        <div v-for="item in domains" :key="item.DomainId" class="dnshub-domain-row">
          <span :title="item.Domain">{{ item.Domain }}</span>
          <span>{{ item.RecordCount || 0 }}</span>
          <span :title="item.DomainId">{{ item.DomainId }}</span>
          <div class="dnshub-record-ops">
            <button class="btn" type="button" @click="openRecords(item)">{{ trans.dnshubRecords }}</button>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="page === 'records'" class="settings-section">
      <p v-if="error" class="text-sm mb-2" style="color: var(--accent-red)">{{ error }}</p>
      <div class="section-title">
        <span>▸</span>
        <button class="btn" type="button" @click="goDomains">{{ trans.dnshubBack }}</button>
        {{ domain?.Domain }}
      </div>
      <form class="dnshub-record-form" @submit.prevent="saveRecord">
        <div class="form-group dnshub-field-host">
          <label class="form-label">{{ trans.dnshubHost }}</label>
          <input v-model="recordForm.Name" class="form-input" required>
        </div>
        <div class="form-group dnshub-field-type">
          <label class="form-label">{{ trans.dnshubType }}</label>
          <select v-model="recordForm.Type" class="form-select">
            <option>A</option><option>AAAA</option><option>CNAME</option><option>MX</option><option>TXT</option><option>NS</option>
          </select>
        </div>
        <div class="form-group dnshub-field-ttl">
          <label class="form-label">TTL</label>
          <input v-model.number="recordForm.TTL" class="form-input" type="number" min="1">
        </div>
        <div class="form-group dnshub-field-value">
          <label class="form-label">{{ trans.dnshubValue }}</label>
          <input v-model="recordForm.Value" class="form-input" required>
        </div>
        <div class="form-group dnshub-field-line">
          <label class="form-label">{{ trans.dnshubLine }}</label>
          <select v-model="recordForm.Line" class="form-select">
            <option v-for="line in lines" :key="line.id" :value="line.id">{{ line.name }}</option>
          </select>
        </div>
        <div class="form-group dnshub-field-remark">
          <label class="form-label">{{ trans.dnshubRemark }}</label>
          <input v-model="recordForm.Remark" class="form-input">
        </div>
        <div class="form-group dnshub-field-mx">
          <label class="form-label">MX</label>
          <input v-model.number="recordForm.MX" class="form-input" type="number" min="0">
        </div>
        <div class="form-group dnshub-actions">
          <button class="btn btn-primary" type="submit">{{ editingId ? trans.dnshubSaveRecord : trans.dnshubAddRecord }}</button>
          <button v-if="editingId" class="btn" type="button" @click="resetRecordForm">{{ trans.dnshubCancelEdit }}</button>
        </div>
      </form>
      <div class="dnshub-record-table mt-3">
        <div class="dnshub-record-head">
          <span class="dnshub-field-host">{{ trans.dnshubHost }}</span>
          <span class="dnshub-field-type">{{ trans.dnshubType }}</span>
          <span class="dnshub-field-ttl">TTL</span>
          <span class="dnshub-field-value">{{ trans.dnshubValue }}</span>
          <span class="dnshub-field-line">{{ trans.dnshubLine }}</span>
          <span class="dnshub-field-remark">{{ trans.dnshubRemark }}</span>
          <span class="dnshub-field-mx">MX</span>
          <span class="dnshub-field-status">{{ trans.dnshubStatus }}</span>
        </div>
        <div v-if="!records.length" class="dnshub-record-empty">{{ trans.dnshubNoRecords }}</div>
        <div v-for="row in records" :key="row.RecordId" class="dnshub-record-row">
          <span class="dnshub-field-host" :title="row.Name">{{ row.Name }}</span>
          <span class="dnshub-field-type">{{ row.Type }}</span>
          <span class="dnshub-field-ttl">{{ row.TTL }}</span>
          <span class="dnshub-field-value" :title="row.Value">{{ row.Value }}</span>
          <span class="dnshub-field-line" :title="String(row.Line || '')">{{ row.Line }}</span>
          <span class="dnshub-field-remark" :title="row.Remark || ''">{{ row.Remark || '' }}</span>
          <span class="dnshub-field-mx">{{ row.MX ?? '' }}</span>
          <div class="dnshub-field-status dnshub-record-ops">
            <span>{{ row.Status === '0' ? trans.dnshubPaused : trans.dnshubEnabled }}</span>
            <button class="btn" type="button" @click="editRecord(row)">{{ trans.edit || '编辑' }}</button>
            <button class="btn" type="button" @click="toggleRecord(row)">{{ row.Status === '0' ? trans.dnshubEnable : trans.dnshubPause }}</button>
            <button class="btn btn-red" type="button" @click="deleteRecord(row)">{{ trans.delete || '删除' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { http } from '../../../utils/http'
import { buildAdminViewQuery, parseAdminViewQuery, sameAdminViewQuery } from '../../../utils/adminView.js'

const props = defineProps({
  trans: { type: Object, required: true },
  activeTab: { type: String, default: '' },
  selectedApiIndex: { type: Number, default: 0 }
})

const route = useRoute()
const router = useRouter()
const initialView = parseAdminViewQuery(route.query)
const page = ref(initialView.dnsPage)
const loading = ref(false)
const error = ref('')
const providers = ref([])
const accounts = ref([])
const account = ref(null)
const domains = ref([])
const domain = ref(null)
const records = ref([])
const lines = ref([{ id: '0', name: '默认' }])
const domainNew = ref('')
const domainQuery = ref('')
const editingId = ref('')
const editingAccountId = ref('')
const optimizeResult = ref('')
const optimizeJobs = ref([])

const accountForm = reactive({
  name: '',
  provider: 'cloudflare',
  credentials: {}
})

const recordForm = reactive({
  Name: '',
  Type: 'A',
  Value: '',
  Line: '0',
  TTL: 600,
  Remark: '',
  MX: null
})

const optimize = reactive({
  accountId: '',
  domain: '',
  domainId: '',
  name: '',
  cdnType: '1',
  ipType: 'v4',
  recordNum: 1,
  ttl: 600,
  intervalHours: 6
})

const currentFields = computed(() => providers.value.find((item) => item.id === accountForm.provider)?.fields || [])

const unwrap = (result) => {
  if (result?.error) throw new Error(result.error)
  return result?.data || {}
}

const requestGet = (url) => http.getByIndex(url, props.selectedApiIndex)
const requestPost = (url, body) => http.postByIndex(url, body, props.selectedApiIndex)
const requestPatch = (url, body) => http.patchByIndex(url, body, props.selectedApiIndex)
const requestDelete = (url) => http.deleteByIndex(url, props.selectedApiIndex)

const syncView = (next = {}) => {
  const query = buildAdminViewQuery(route.query, {
    tab: 'dnshub',
    dnsPage: page.value,
    dnsAccount: account.value?.id || '',
    dnsDomain: domain.value?.Domain || '',
    dnsDomainId: domain.value?.DomainId || '',
    ...next
  })
  if (sameAdminViewQuery(query, route.query)) return
  router.push({ path: '/admin', query })
}

const goHome = () => {
  page.value = 'home'
  domain.value = null
  syncView({ dnsPage: 'home', dnsDomain: '', dnsDomainId: '' })
}

const goDomains = async () => {
  page.value = 'domains'
  domain.value = null
  syncView({ dnsPage: 'domains', dnsDomain: '', dnsDomainId: '' })
  if (account.value) await loadDomains()
}

const providerName = (id) => providers.value.find((item) => item.id === id)?.name || id

const resetCredentials = () => {
  accountForm.credentials = {}
}

const cancelEditAccount = () => {
  editingAccountId.value = ''
  accountForm.name = ''
  accountForm.provider = providers.value[0]?.id || 'cloudflare'
  resetCredentials()
}

const startEditAccount = (item) => {
  editingAccountId.value = item.id
  accountForm.name = item.name
  accountForm.provider = item.provider
  resetCredentials()
}

const saveAccount = async () => {
  error.value = ''
  loading.value = true
  const credentials = {}
  for (const [key, value] of Object.entries(accountForm.credentials)) {
    if (String(value || '').trim()) credentials[key] = String(value).trim()
  }
  try {
    if (editingAccountId.value) {
      unwrap(await requestPatch(`/api/dnshub/accounts/${editingAccountId.value}`, {
        name: accountForm.name,
        provider: accountForm.provider,
        credentials
      }))
      cancelEditAccount()
    } else {
      unwrap(await requestPost('/api/dnshub/accounts', {
        name: accountForm.name,
        provider: accountForm.provider,
        credentials
      }))
      accountForm.name = ''
      resetCredentials()
    }
    await loadAccounts()
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}

const resetRecordForm = () => {
  editingId.value = ''
  recordForm.Name = ''
  recordForm.Type = 'A'
  recordForm.Value = ''
  recordForm.Line = lines.value[0]?.id || '0'
  recordForm.TTL = 600
  recordForm.Remark = ''
  recordForm.MX = null
}

const loadProviders = async () => {
  const result = unwrap(await requestGet('/api/dnshub/providers'))
  providers.value = result?.data || []
  if (!accountForm.provider && providers.value[0]) accountForm.provider = providers.value[0].id
}

const loadAccounts = async () => {
  const result = unwrap(await requestGet('/api/dnshub/accounts'))
  accounts.value = result?.data || []
  if (!optimize.accountId && accounts.value[0]) optimize.accountId = accounts.value[0].id
}

const loadOptimizeJobs = async () => {
  const result = unwrap(await requestGet('/api/dnshub/optimize/jobs'))
  optimizeJobs.value = result?.data || []
}

const restoreDnsView = async () => {
  const view = parseAdminViewQuery(route.query)
  if (view.tab !== 'dnshub') return
  if (view.dnsAccount) {
    const item = accounts.value.find((row) => row.id === view.dnsAccount)
    if (item) {
      account.value = item
      optimize.accountId = item.id
    }
  } else if (view.dnsPage === 'home') {
    account.value = null
  }
  const nextPage = view.dnsPage || 'home'
  const same =
    page.value === nextPage &&
    (account.value?.id || '') === (view.dnsAccount || '') &&
    (domain.value?.Domain || '') === (view.dnsDomain || '') &&
    (domain.value?.DomainId || '') === (view.dnsDomainId || '')
  if (same) return
  if (nextPage === 'domains' && account.value) {
    page.value = 'domains'
    domain.value = null
    await loadDomains()
    return
  }
  if (nextPage === 'records' && account.value && view.dnsDomain) {
    page.value = 'records'
    domain.value = { Domain: view.dnsDomain, DomainId: view.dnsDomainId }
    await loadLines()
    await loadRecords()
    return
  }
  page.value = 'home'
  domain.value = null
}

const bootstrap = async () => {
  error.value = ''
  try {
    await loadProviders()
    await loadAccounts()
    await loadOptimizeJobs()
    await restoreDnsView()
  } catch (err) {
    error.value = err.message || String(err)
  }
}

watch(() => props.activeTab, (value) => {
  if (value === 'dnshub') bootstrap()
}, { immediate: true })

watch(() => [route.query.tab, route.query.dnsPage, route.query.dnsAccount, route.query.dnsDomain, route.query.dnsDomainId], async () => {
  if (props.activeTab !== 'dnshub') return
  try {
    await restoreDnsView()
  } catch (err) {
    error.value = err.message || String(err)
  }
})

const removeAccount = async (item) => {
  error.value = ''
  try {
    unwrap(await requestDelete(`/api/dnshub/accounts/${item.id}`))
    await loadAccounts()
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const useAccount = (item) => {
  optimize.accountId = item.id
}

const openDomains = async (item) => {
  account.value = item
  optimize.accountId = item.id
  domain.value = null
  page.value = 'domains'
  syncView({ dnsPage: 'domains', dnsAccount: item.id, dnsDomain: '', dnsDomainId: '' })
  await loadDomains()
}

const loadDomains = async () => {
  error.value = ''
  try {
    const q = domainQuery.value.trim()
    const result = unwrap(await requestGet(`/api/dnshub/accounts/${account.value.id}/domains${q ? `?q=${encodeURIComponent(q)}` : ''}`))
    domains.value = result?.data?.list || []
  } catch (err) {
    error.value = err.message || String(err)
    domains.value = []
  }
}

const addDomain = async () => {
  if (!domainNew.value.trim()) return
  error.value = ''
  try {
    unwrap(await requestPost(`/api/dnshub/accounts/${account.value.id}/domains`, { Domain: domainNew.value.trim() }))
    domainNew.value = ''
    await loadDomains()
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const openRecords = async (item) => {
  domain.value = item
  page.value = 'records'
  syncView({
    dnsPage: 'records',
    dnsAccount: account.value?.id || '',
    dnsDomain: item.Domain,
    dnsDomainId: item.DomainId
  })
  await loadLines()
  await loadRecords()
}

const loadLines = async () => {
  try {
    const result = unwrap(await requestGet(`/api/dnshub/accounts/${account.value.id}/lines?domain=${encodeURIComponent(domain.value.Domain)}&domainId=${encodeURIComponent(domain.value.DomainId)}`))
    lines.value = result?.data || [{ id: '0', name: '默认' }]
    if (!recordForm.Line) recordForm.Line = lines.value[0]?.id || '0'
  } catch (_) {
    lines.value = [{ id: '0', name: '默认' }]
  }
}

const loadRecords = async () => {
  error.value = ''
  try {
    const result = unwrap(await requestGet(`/api/dnshub/accounts/${account.value.id}/records?domain=${encodeURIComponent(domain.value.Domain)}&domainId=${encodeURIComponent(domain.value.DomainId)}`))
    records.value = result?.data?.list || []
  } catch (err) {
    error.value = err.message || String(err)
    records.value = []
  }
}

const saveRecord = async () => {
  error.value = ''
  const payload = {
    domain: domain.value.Domain,
    domainId: domain.value.DomainId,
    Name: recordForm.Name,
    Type: recordForm.Type,
    Value: recordForm.Value,
    Line: recordForm.Line || '0',
    TTL: Number(recordForm.TTL || 600),
    Remark: recordForm.Remark || null,
    MX: recordForm.MX === null || recordForm.MX === '' ? null : Number(recordForm.MX)
  }
  try {
    if (editingId.value) {
      unwrap(await requestPatch(`/api/dnshub/accounts/${account.value.id}/records/${editingId.value}`, payload))
    } else {
      unwrap(await requestPost(`/api/dnshub/accounts/${account.value.id}/records`, payload))
    }
    resetRecordForm()
    await loadRecords()
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const editRecord = (row) => {
  editingId.value = row.RecordId
  recordForm.Name = row.Name
  recordForm.Type = row.Type
  recordForm.Value = row.Value
  recordForm.Line = row.Line
  recordForm.TTL = row.TTL
  recordForm.Remark = row.Remark || ''
  recordForm.MX = row.MX
}

const toggleRecord = async (row) => {
  error.value = ''
  try {
    unwrap(await requestPatch(`/api/dnshub/accounts/${account.value.id}/records/${row.RecordId}`, {
      domain: domain.value.Domain,
      domainId: domain.value.DomainId,
      Status: row.Status === '0' ? '1' : '0'
    }))
    await loadRecords()
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const deleteRecord = async (row) => {
  error.value = ''
  try {
    unwrap(await requestDelete(`/api/dnshub/accounts/${account.value.id}/records/${row.RecordId}?domain=${encodeURIComponent(domain.value.Domain)}&domainId=${encodeURIComponent(domain.value.DomainId)}`))
    await loadRecords()
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const previewOptimize = async () => {
  error.value = ''
  try {
    const result = unwrap(await requestGet(`/api/dnshub/optimize/preview?cdnType=${optimize.cdnType}&ipType=${optimize.ipType}`))
    optimizeResult.value = JSON.stringify(result?.data, null, 2)
  } catch (err) {
    optimizeResult.value = err.message || String(err)
  }
}

const applyOptimize = async () => {
  error.value = ''
  try {
    const result = unwrap(await requestPost('/api/dnshub/optimize/apply', { ...optimize }))
    const data = result?.data || {}
    optimizeResult.value = `已写入：新增 ${data.added}，修改 ${data.changed}，删除 ${data.deleted}`
  } catch (err) {
    optimizeResult.value = err.message || String(err)
  }
}

const saveOptimizeJob = async () => {
  error.value = ''
  try {
    unwrap(await requestPost('/api/dnshub/optimize/jobs', { ...optimize }))
    optimizeResult.value = props.trans.dnshubJobSaved
    await loadOptimizeJobs()
  } catch (err) {
    optimizeResult.value = err.message || String(err)
  }
}

const toggleOptimizeJob = async (job) => {
  unwrap(await requestPatch(`/api/dnshub/optimize/jobs/${job.id}`, { enabled: !job.enabled }))
  await loadOptimizeJobs()
}

const runOptimizeJob = async (job) => {
  error.value = ''
  try {
    const result = unwrap(await requestPost(`/api/dnshub/optimize/jobs/${job.id}/run`, {}))
    const data = result?.result || result
    optimizeResult.value = data?.added != null ? `已写入：新增 ${data.added}，修改 ${data.changed}，删除 ${data.deleted}` : (result.lastResult || props.trans.dnshubJobSaved)
    await loadOptimizeJobs()
  } catch (err) {
    optimizeResult.value = err.message || String(err)
  }
}

const removeOptimizeJob = async (job) => {
  if (!window.confirm(`${job.name}.${job.domain}?`)) return
  unwrap(await requestDelete(`/api/dnshub/optimize/jobs/${job.id}`))
  await loadOptimizeJobs()
}
</script>
