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
    wafNode: ''
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

test('sameAdminViewQuery ignores key order', () => {
  assert.equal(sameAdminViewQuery({ tab: 'dnshub', dnsPage: 'domains' }, { dnsPage: 'domains', tab: 'dnshub' }), true)
  assert.equal(sameAdminViewQuery({ tab: 'wafpanel' }, { tab: 'wafpanel', wafPage: 'logs' }), false)
})

test('admin view navigation pushes history entries so the browser back button restores the previous page', () => {
  const admin = readFileSync(new URL('../src/frontend/views/admin/index.vue', import.meta.url), 'utf8')
  const dns = readFileSync(new URL('../src/frontend/views/admin/components/DnsHubPanel.vue', import.meta.url), 'utf8')
  const waf = readFileSync(new URL('../src/frontend/views/admin/components/WafPanel.vue', import.meta.url), 'utf8')
  const i18n = readFileSync(new URL('../src/frontend/utils/i18n.js', import.meta.url), 'utf8')

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
