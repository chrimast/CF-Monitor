const ADMIN_TABS = ['servers', 'settings', 'database', 'themeStore', 'donation', 'dnshub']
const DNSHUB_PAGES = ['home', 'domains', 'records']

export const parseAdminViewQuery = (query = {}) => {
  const tab = ADMIN_TABS.includes(query.tab) ? query.tab : 'servers'
  const dnsPage = DNSHUB_PAGES.includes(query.dnsPage) ? query.dnsPage : 'home'
  return {
    tab,
    dnsPage: tab === 'dnshub' ? dnsPage : 'home',
    dnsAccount: tab === 'dnshub' ? String(query.dnsAccount || '') : '',
    dnsDomain: tab === 'dnshub' ? String(query.dnsDomain || '') : '',
    dnsDomainId: tab === 'dnshub' ? String(query.dnsDomainId || '') : ''
  }
}

export const buildAdminViewQuery = (current = {}, next = {}) => {
  const query = { ...current }
  const view = parseAdminViewQuery({ ...current, ...next })
  if (view.tab && view.tab !== 'servers') query.tab = view.tab
  else delete query.tab

  if (view.tab === 'dnshub' && view.dnsPage !== 'home') query.dnsPage = view.dnsPage
  else delete query.dnsPage

  if (view.tab === 'dnshub' && view.dnsAccount) query.dnsAccount = view.dnsAccount
  else delete query.dnsAccount

  if (view.tab === 'dnshub' && view.dnsPage === 'records' && view.dnsDomain) query.dnsDomain = view.dnsDomain
  else delete query.dnsDomain

  if (view.tab === 'dnshub' && view.dnsPage === 'records' && view.dnsDomainId) query.dnsDomainId = view.dnsDomainId
  else delete query.dnsDomainId

  return query
}
