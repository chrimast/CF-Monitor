import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAdminViewQuery, parseAdminViewQuery } from '../src/frontend/utils/adminView.js'

test('parseAdminViewQuery restores tab and DNSHub drill-down from hash query', () => {
  assert.deepEqual(parseAdminViewQuery({}), {
    tab: 'servers',
    dnsPage: 'home',
    dnsAccount: '',
    dnsDomain: '',
    dnsDomainId: ''
  })
  assert.equal(parseAdminViewQuery({ tab: 'dnshub' }).tab, 'dnshub')
  assert.equal(parseAdminViewQuery({ tab: 'dnshub', dnsPage: 'domains', dnsAccount: 'acc-1' }).dnsPage, 'domains')
  assert.equal(parseAdminViewQuery({ tab: 'dnshub', dnsPage: 'records', dnsAccount: 'acc-1', dnsDomain: 'example.com', dnsDomainId: 'zone-1' }).dnsDomain, 'example.com')
  assert.equal(parseAdminViewQuery({ tab: 'nope' }).tab, 'servers')
})

test('buildAdminViewQuery keeps current page in hash query and drops stale DNSHub keys', () => {
  assert.deepEqual(buildAdminViewQuery({ apiIndex: '1' }, { tab: 'dnshub' }), { apiIndex: '1', tab: 'dnshub' })
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
