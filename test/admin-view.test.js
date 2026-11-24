import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildAdminViewQuery, parseAdminViewQuery, sameAdminViewQuery } from '../src/frontend/utils/adminView.js'

test('parseAdminViewQuery restores tab and DNSHub drill-down from hash query', () => {
  assert.deepEqual(parseAdminViewQuery({}), {
    tab: 'servers',
    dnsPage: 'home',
    dnsAccount: '',
    dnsDomain: '',
    dnsDomainId: '',
    wafPage: 'nodes',
    wafNode: '',
    settingsPage: ''
  })
  assert.equal(parseAdminViewQuery({ tab: 'dnshub' }).tab, 'dnshub')
  assert.equal(parseAdminViewQuery({ tab: 'wafpanel' }).tab, 'wafpanel')
  assert.equal(parseAdminViewQuery({ tab: 'dnshub', dnsPage: 'domains', dnsAccount: 'acc-1' }).dnsPage, 'domains')
  assert.equal(parseAdminViewQuery({ tab: 'dnshub', dnsPage: 'records', dnsAccount: 'acc-1', dnsDomain: 'example.com', dnsDomainId: 'zone-1' }).dnsDomain, 'example.com')
  assert.equal(parseAdminViewQuery({ tab: 'nope' }).tab, 'servers')
})

test('buildAdminViewQuery keeps current page in hash query and drops stale DNSHub keys', () => {
  assert.deepEqual(buildAdminViewQuery({ apiIndex: '1' }, { tab: 'dnshub' }), { apiIndex: '1', tab: 'dnshub' })
  assert.deepEqual(buildAdminViewQuery({ apiIndex: '1' }, { tab: 'wafpanel', wafPage: 'logs', wafNode: 'n1' }), {
    apiIndex: '1',
    tab: 'wafpanel',
    wafPage: 'logs',
    wafNode: 'n1'
  })
  assert.deepEqual(buildAdminViewQuery({}, { tab: 'dnshub', dnsPage: 'domains', dnsAccount: 'acc-1' }), {
    tab: 'dnshub',
    dnsPage: 'domains',
    dnsAccount: 'acc-1'
  })
  assert.deepEqual(buildAdminViewQuery({
    tab: 'dnshub',
    dnsPage: 'records',
    dnsAccount: 'acc-1',
    dnsDomain: 'example.com',
    dnsDomainId: 'zone-1'
  }, { tab: 'servers' }), {})
})

test('settings category route survives refresh and participates in browser back', () => {
  assert.equal(parseAdminViewQuery({ tab: 'settings' }).settingsPage, 'appearance')
  assert.equal(parseAdminViewQuery({ tab: 'settings', settingsPage: 'security' }).settingsPage, 'security')
  assert.equal(parseAdminViewQuery({ tab: 'servers', settingsPage: 'security' }).settingsPage, '')
  assert.deepEqual(buildAdminViewQuery({ tab: 'settings', settingsPage: 'security', apiIndex: '1' }, { tab: 'settings' }), {
    tab: 'settings', settingsPage: 'security', apiIndex: '1'
  })
  assert.deepEqual(buildAdminViewQuery({ tab: 'settings', settingsPage: 'security' }, { tab: 'servers' }), {})
})

test('sameAdminViewQuery ignores key order', () => {
  assert.equal(sameAdminViewQuery({ tab: 'dnshub', dnsPage: 'domains' }, { dnsPage: 'domains', tab: 'dnshub' }), true)
  assert.equal(sameAdminViewQuery({ tab: 'wafpanel' }, { tab: 'wafpanel', wafPage: 'logs' }), false)
})

test('admin view navigation pushes history entries so the browser back button restores the previous page', () => {
  const admin = readFileSync(new URL('../src/frontend/views/admin/index.vue', import.meta.url), 'utf8')
  const dns = readFileSync(new URL('../src/frontend/views/admin/components/DnsHubPanel.vue', import.meta.url), 'utf8')
  const waf = readFileSync(new URL('../src/frontend/views/admin/components/WafPanel.vue', import.meta.url), 'utf8')
  const i18n = ['en', 'zh'].map(lang => readFileSync(new URL(`../src/frontend/locales/${lang}.js`, import.meta.url), 'utf8')).join('\n')

  assert.match(admin, /router\.push\(\{ path: '\/admin', query \}\)/)
  assert.doesNotMatch(admin, /const syncAdminViewQuery[\s\S]*router\.replace\(\{ path: '\/admin', query \}\)/)
  assert.match(dns, /router\.push\(\{ path: '\/admin', query \}\)/)
  assert.doesNotMatch(dns, /router\.replace\(\{ path: '\/admin', query \}\)/)
  assert.match(waf, /router\.push\(\{ path: '\/admin', query \}\)/)
  assert.doesNotMatch(waf, /router\.replace\(\{ path: '\/admin', query \}\)/)
  assert.match(dns, /watch\(\(\) => \[route\.query\.(tab|dnsPage)/)
  assert.match(waf, /watch\(\(\) => \[route\.query\.(tab|wafPage)/)
  assert.equal((i18n.match(/wafpanelAgentCommands:/g) || []).length, 2)
  assert.equal((i18n.match(/wafpanelUnreachableHint:/g) || []).length, 2)
})

test('authenticated admin can render the installation settings modal', () => {
  const admin = readFileSync(new URL('../src/frontend/views/admin/index.vue', import.meta.url), 'utf8')
  assert.match(admin, /const hasCorrectionValue = \(value\) =>/)
  assert.match(admin, /if \(hasCorrectionValue\(rxCorrection\.value\)\)/)
  assert.match(admin, /if \(hasCorrectionValue\(txCorrection\.value\)\)/)
})

test('admin login uses the refreshed responsive branded form', () => {
  const login = readFileSync(new URL('../src/frontend/views/admin/components/AdminLogin.vue', import.meta.url), 'utf8')
  const hasLoginUi = readFileSync(new URL('../src/frontend/views/admin/components/AdminLogin.vue', import.meta.url), 'utf8')
    .includes('admin-login-screen')
  assert.match(login, /admin-login-screen/)
  assert.match(login, /admin-login-card/)
  assert.match(login, /:disabled="loginLoading"/)
  assert.match(login, /aria-live="polite"/)
  assert.ok(hasLoginUi)
})

test('admin tabs name their matching panels and use the existing history navigation', () => {
  const admin = readFileSync(new URL('../src/frontend/views/admin/index.vue', import.meta.url), 'utf8')
  assert.match(admin, /role="tablist"/)
  assert.ok(admin.includes(':aria-controls="`tab-${panel}`"'))
  assert.match(admin, /@click="setActiveTab\(tab\)"/)
  for (const [file, panel, tab] of [
    ['ServerTable', 'servers', 'servers'], ['SettingsPanel', 'settings', 'settings'],
    ['DatabasePanel', 'database', 'database'], ['ThemeStorePanel', 'theme-store', 'themeStore'],
    ['DonationPanel', 'donation', 'donation'], ['DnsHubPanel', 'dnshub', 'dnshub'], ['WafPanel', 'wafpanel', 'wafpanel']
  ]) {
    const component = readFileSync(new URL(`../src/frontend/views/admin/components/${file}.vue`, import.meta.url), 'utf8')
    assert.ok(component.includes(`id="tab-${panel}"`))
    assert.ok(component.includes(`aria-labelledby="admin-tab-${tab}"`))
    assert.match(component, /role="tabpanel"/)
  }
})

test('mobile server list can expand details and return to the complete table', () => {
  const table = readFileSync(new URL('../src/frontend/views/admin/components/ServerTable.vue', import.meta.url), 'utf8')
  assert.ok(table.includes('admin-server-table-wrap'))
  assert.ok(table.includes(':aria-expanded="expandedServers.has(server.id)"'))
  assert.ok(table.includes('fullServerTable'))
})

test('admin header centers compact stats and uses a black H1 without a fill', () => {
  const header = readFileSync(new URL('../src/frontend/components/TerminalHeader.vue', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../src/frontend/styles/admin-workspace.css', import.meta.url), 'utf8')
  const admin = readFileSync(new URL('../src/frontend/views/admin/index.vue', import.meta.url), 'utf8')
  assert.match(header, /<h1[^>]*terminal-title-admin/)
  assert.ok(admin.includes(':admin-stats="stats"'))
  assert.doesNotMatch(admin, /<div class="main-panel admin-overview"/)
  assert.equal((admin.match(/id="stats-panel"/g) || []).length, 0)
  assert.equal((admin.match(/@click="logout"/g) || []).length, 1)
  assert.match(admin, /admin-workspace-toolbar[\s\S]*role="tablist"[\s\S]*admin-workspace-toolbar-actions/)
  assert.match(styles, /admin-header-stats/)
  assert.match(styles, /terminal-title-admin[^}]*color:\s*#000/)
  assert.match(styles, /terminal-header-admin[^}]*background:\s*transparent/)
  assert.match(styles, /terminal-header-controls[^}]*grid-column:\s*3/)
})

test('settings use one standalone page per category and retain unsaved-state feedback', () => {
  const settings = readFileSync(new URL('../src/frontend/views/admin/components/SettingsPanel.vue', import.meta.url), 'utf8')
  assert.equal((settings.match(/class="settings-section settings-page"/g) || []).length, 8)
  assert.doesNotMatch(settings, /<details class="settings-section"/)
  assert.ok(settings.includes('selectedSettingsPage === id'))
  assert.ok(settings.includes("emit('settings-page-change', id)"))
  assert.ok(settings.includes('dirty ? trans.adminUnsavedSettings'))
})
