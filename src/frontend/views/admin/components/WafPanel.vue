<template>
  <div id="tab-wafpanel" class="tab-content" :class="{ active: activeTab === 'wafpanel' }">
    <p v-if="error" class="text-sm mb-2" style="color: var(--accent-red)">{{ error }}</p>
    <p v-if="notice" class="text-sm mb-2" style="color: var(--accent-green)">{{ notice }}</p>

    <div v-if="page === 'nodes'" class="settings-section">
      <div class="section-title"><span>▸</span> {{ trans.wafpanelNodes }}</div>
      <p class="dnshub-hint">{{ trans.wafpanelDesc }}</p>
      <form class="dnshub-compact-grid" @submit.prevent="saveNode">
        <div class="form-group">
          <label class="form-label">{{ trans.wafpanelNodeName }}</label>
          <input v-model="nodeForm.name" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">{{ trans.wafpanelNodeUrl }}</label>
          <input v-model="nodeForm.url" class="form-input" placeholder="https://host:10087" required>
        </div>
        <div class="form-group">
          <label class="form-label">{{ trans.wafpanelNodeToken }}</label>
          <input v-model="nodeForm.token" class="form-input" :placeholder="editingId ? trans.wafpanelKeepToken : ''">
        </div>
        <div class="form-group dnshub-actions">
          <button class="btn btn-primary" type="submit" :disabled="loading">{{ editingId ? trans.wafpanelSaveNode : trans.wafpanelAddNode }}</button>
          <button v-if="editingId" class="btn" type="button" @click="cancelEdit">{{ trans.dnshubCancelEdit }}</button>
        </div>
      </form>
      <div class="dnshub-actions" style="margin-bottom:8px">
        <button class="btn" type="button" @click="probeNodes">{{ trans.wafpanelProbe }}</button>
      </div>
      <div class="dnshub-account-list">
        <div v-if="!nodes.length" class="text-muted">{{ trans.wafpanelNoNodes }}</div>
        <div v-for="item in nodes" :key="item.id" class="dnshub-account-row">
          <button class="dnshub-account-name" type="button" @click="openNode(item, 'dashboard')">
            <strong>{{ item.name }}</strong>
            <span class="text-muted text-sm">{{ item.url }}</span>
            <span class="text-sm" :style="{ color: nodeStatusColor(item) }">{{ nodeStatusText(item) }}</span>
          </button>
          <div class="header-actions">
            <button class="btn" type="button" @click="openNode(item, 'dashboard')" :disabled="item.online === false">{{ trans.wafpanelDashboard }}</button>
            <button class="btn" type="button" @click="openNode(item, 'logs')" :disabled="item.online === false">{{ trans.wafpanelLogs }}</button>
            <button class="btn" type="button" @click="startEdit(item)">{{ trans.edit || '编辑' }}</button>
            <button class="btn btn-red" type="button" @click="removeNode(item)">{{ trans.delete || '删除' }}</button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="wafpanel-workbench">
      <div class="wafpanel-toolbar">
        <button class="btn" type="button" @click="goNodes">{{ trans.wafpanelBack }}</button>
        <strong>{{ currentNode?.name || trans.wafpanelSelectNode }}</strong>
        <span class="text-sm" :style="{ color: nodeStatusColor(currentNode || {}) }">{{ nodeStatusText(currentNode || {}) }}</span>
        <button class="btn" type="button" @click="retryCurrentNode">{{ trans.wafpanelRetry }}</button>
        <button
          v-for="item in wafpanelPages"
          :key="item.id"
          class="btn"
          type="button"
          :class="{ 'btn-primary': page === item.id }"
          @click="setPage(item.id)"
        >{{ item.label }}</button>
      </div>
      <div v-if="currentNodeUnreachable" class="settings-section">
        <p>{{ currentNode?.name }}：{{ nodeStatusText(currentNode) }}</p>
        <p class="dnshub-hint">{{ trans.wafpanelUnreachableHint }}</p>
        <button class="btn btn-primary" type="button" @click="retryCurrentNode">{{ trans.wafpanelRetry }}</button>
        <button class="btn" type="button" @click="goNodes">{{ trans.wafpanelBack }}</button>
      </div>

      <div v-else-if="page === 'dashboard'" class="settings-section">
        <div class="wafpanel-dash">
          <div id="wafpanel-map" class="wafpanel-map"></div>
          <div class="wafpanel-side">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-main-value">{{ dashboard.waf_state === 'on' ? trans.wafpanelRunning : trans.wafpanelStopped }}</div>
                <div class="stat-label">{{ trans.wafpanelWafState }} · {{ dashboard.waf_mode || '-' }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-main-value">{{ todayStat.req_count || 0 }}</div>
                <div class="stat-label">{{ trans.wafpanelTodayRequests }} · 4xx {{ todayStat.count4xx || 0 }} / 5xx {{ todayStat.count5xx || 0 }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-main-value">{{ todayStat.attack_count || 0 }}</div>
                <div class="stat-label">{{ trans.wafpanelTodayAttacks }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-main-value">{{ (dashboard.top_ips && dashboard.top_ips[0] && dashboard.top_ips[0].ip) || '—' }}</div>
                <div class="stat-label">Top IP</div>
              </div>
            </div>
            <div class="settings-section">
              <div class="section-title">{{ trans.wafpanelGeo }}</div>
              <div class="dnshub-compact-grid">
                <div class="form-group">
                  <label class="form-label">{{ trans.wafpanelState }}</label>
                  <button class="btn" type="button" @click="geo.state = geo.state === 'on' ? 'off' : 'on'">{{ geo.state === 'on' ? trans.wafpanelEnabled : trans.wafpanelDisabled }}</button>
                </div>
                <div class="form-group">
                  <label class="form-label">{{ trans.wafpanelAction }}</label>
                  <select v-model="geo.action" class="form-select">
                    <option value="deny">{{ trans.wafpanelGeoDeny }}</option>
                    <option value="allow">{{ trans.wafpanelGeoAllow }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">{{ trans.wafpanelCountries }}</label>
                  <input v-model="geoRulesText" class="form-input" placeholder="CN,US,RU">
                </div>
                <div class="form-group dnshub-actions">
                  <button class="btn btn-primary" type="button" @click="saveGeo">{{ trans.wafpanelSaveReload }}</button>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <div class="section-title">{{ trans.wafpanelAsn }}</div>
              <div class="row" style="display:flex;gap:8px">
                <input v-model="asnQuery" class="form-input" placeholder="AS4134">
                <button class="btn btn-primary" type="button" @click="lookupASN">{{ trans.wafpanelLookup }}</button>
              </div>
              <div v-if="asnResult.name" class="text-sm" style="margin-top:8px">
                <p><strong>{{ asnResult.name }}</strong> — {{ asnResult.count }} {{ trans.wafpanelPrefixes }}</p>
                <button class="btn btn-red" type="button" @click="blockASN">{{ trans.wafpanelBlockAsn }}</button>
                <div class="wafpanel-table" style="margin-top:8px;max-height:240px;overflow:auto">
                  <div v-for="item in (asnResult.prefixes || []).slice(0, 50)" :key="item.prefix" class="dnshub-domain-row">
                    <code>{{ item.prefix }}</code>
                    <button class="btn" type="button" @click="addBlack(item.prefix)">{{ trans.wafpanelAdd }}</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <div class="section-title">{{ trans.wafpanelRules }}</div>
              <div class="wafpanel-table">
                <div v-for="item in ruleList" :key="item.key" class="dnshub-domain-row">
                  <span>{{ item.label }}</span>
                  <button class="btn" type="button" @click="toggleRule(item.key, item.state === 'on' ? 'off' : 'on')">{{ item.state === 'on' ? trans.wafpanelEnabled : trans.wafpanelDisabled }}</button>
                </div>
              </div>
              <div v-if="ccForm" class="dnshub-compact-grid" style="margin-top:8px">
                <div class="form-group"><label class="form-label">CC threshold</label><input v-model.number="ccForm.threshold" class="form-input" type="number"></div>
                <div class="form-group"><label class="form-label">CC duration</label><input v-model.number="ccForm.duration" class="form-input" type="number"></div>
                <div class="form-group"><label class="form-label">CC ipBlockTime</label><input v-model.number="ccForm.ipBlockTime" class="form-input" type="number"></div>
                <div class="form-group dnshub-actions"><button class="btn btn-primary" type="button" @click="saveCc">{{ trans.wafpanelSaveReload }}</button></div>
              </div>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="section-title">{{ trans.wafpanelRecent }}</div>
          <div class="wafpanel-table">
            <div class="dnshub-domain-head"><span>{{ trans.wafpanelTime }}</span><span>IP</span><span>{{ trans.wafpanelRule }}</span><span>URI</span></div>
            <div v-if="!(dashboard.recent || []).length" class="text-muted">暂无记录</div>
            <div v-for="row in dashboard.recent || []" :key="row.id || (row.ip + row.localtime)" class="dnshub-domain-row">
              <span>{{ row.localtime }}</span>
              <code>{{ row.ip }}</code>
              <span>{{ row.rule }}</span>
              <span>{{ row.uri }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="page === 'logs'" class="settings-section">
        <div class="dnshub-domain-toolbar" style="display:flex;gap:8px;margin-bottom:12px">
          <input v-model="logSearch" class="form-input" :placeholder="trans.wafpanelSearchLogs" @keyup.enter="loadLogs(1)">
          <button class="btn btn-primary" type="button" @click="loadLogs(1)">{{ trans.wafpanelSearch }}</button>
          <span class="text-muted text-sm">{{ logsTotal }} {{ trans.wafpanelItems }}</span>
        </div>
        <div class="wafpanel-table">
          <div class="dnshub-domain-head">
            <span>IP</span>
            <span>{{ trans.wafpanelCount }}</span>
            <span>{{ trans.wafpanelRule }}</span>
            <span>URI</span>
            <span>{{ trans.wafpanelFirstSeen }}</span>
            <span>{{ trans.wafpanelLastSeen }}</span>
            <span>{{ trans.wafpanelTempBan }}</span>
            <span>{{ trans.wafpanelPermBan }}</span>
            <span></span>
          </div>
          <div v-if="!logs.length" class="text-muted">暂无记录</div>
          <div v-for="row in logs" :key="row.ip" class="dnshub-domain-row">
            <code>{{ row.ip }}</code>
            <span>{{ row.count }}</span>
            <span>{{ row.rule }}</span>
            <span>{{ row.uri }}</span>
            <span>{{ row.first_seen }}</span>
            <span>{{ row.last_seen }}</span>
            <button class="btn" type="button" @click="toggleLogBan(row, 'temporary', !row.is_temporary_banned)">{{ row.is_temporary_banned ? trans.wafpanelUnban : trans.wafpanelTempBan }}</button>
            <button class="btn" type="button" @click="toggleLogBan(row, 'permanent', !row.is_permanent_banned)">{{ row.is_permanent_banned ? trans.wafpanelUnban : trans.wafpanelPermBan }}</button>
            <button class="btn" type="button" @click="showDetail(row)">{{ trans.wafpanelDetail }}</button>
          </div>
        </div>
        <div v-if="logPages > 1" class="dnshub-actions" style="margin-top:8px">
          <button class="btn" type="button" :disabled="logPage <= 1" @click="loadLogs(logPage - 1)">‹</button>
          <span class="text-sm">{{ logPage }} / {{ logPages }}</span>
          <button class="btn" type="button" :disabled="logPage >= logPages" @click="loadLogs(logPage + 1)">›</button>
        </div>
        <div v-if="logDetail" class="settings-section" style="margin-top:12px">
          <div class="section-title">{{ trans.wafpanelDetail }} {{ logDetail.ip }}</div>
          <div class="wafpanel-table">
            <div class="dnshub-domain-row"><span>{{ trans.wafpanelTime }}</span><span>{{ logDetail.localtime }}</span></div>
            <div class="dnshub-domain-row"><span>IP</span><code>{{ logDetail.ip }}</code></div>
            <div class="dnshub-domain-row"><span>{{ trans.wafpanelRule }}</span><span>{{ logDetail.rule }}</span></div>
            <div class="dnshub-domain-row"><span>URI</span><span>{{ logDetail.uri }}</span></div>
            <div class="dnshub-domain-row"><span>{{ trans.wafpanelMethod }}</span><span>{{ logDetail.method }}</span></div>
            <div class="dnshub-domain-row"><span>{{ trans.wafpanelStatusCode }}</span><span>{{ logDetail.status_code }}</span></div>
            <div class="dnshub-domain-row"><span>UA</span><span>{{ logDetail.user_agent }}</span></div>
          </div>
          <pre class="text-sm">{{ logDetail.nginx_log || JSON.stringify(logDetail, null, 2) }}</pre>
        </div>
      </div>

      <div v-else-if="page === 'bans'" class="settings-section">
        <div class="section-title">{{ trans.wafpanelBlocks }}</div>
        <div class="wafpanel-table">
          <div class="dnshub-domain-head"><span>{{ trans.wafpanelTime }}</span><span>IP</span><span>{{ trans.wafpanelDuration }}</span><span>{{ trans.wafpanelState }}</span><span></span></div>
          <div v-for="row in bans" :key="row.id || row.ip" class="dnshub-domain-row">
            <span>{{ row.create_date }}</span>
            <code>{{ row.ip }}</code>
            <span>{{ row.blocking_time ? row.blocking_time + 's' : trans.wafpanelPermanent }}</span>
            <span>{{ row.is_block ? trans.wafpanelBlocking : trans.wafpanelUnbanned }}</span>
            <button class="btn btn-red" type="button" @click="unblock(row)">{{ trans.wafpanelUnban }}</button>
          </div>
        </div>
        <div v-if="banPages > 1" class="dnshub-actions" style="margin-top:8px">
          <button class="btn" type="button" :disabled="banPage <= 1" @click="loadBans(banPage - 1)">‹</button>
          <span class="text-sm">{{ banPage }} / {{ banPages }}</span>
          <button class="btn" type="button" :disabled="banPage >= banPages" @click="loadBans(banPage + 1)">›</button>
        </div>
        <div class="section-title" style="margin-top:16px">{{ trans.wafpanelBlackWhite }}</div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="btn" type="button" :class="{ 'btn-primary': listType === 'black' }" @click="listType = 'black'">{{ trans.wafpanelBlack }} ({{ (blacklist.ipBlack || []).length }})</button>
          <button class="btn" type="button" :class="{ 'btn-primary': listType === 'white' }" @click="listType = 'white'">{{ trans.wafpanelWhite }} ({{ (blacklist.ipWhite || []).length }})</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input v-model="newIp" class="form-input" placeholder="IP / CIDR">
          <button class="btn btn-primary" type="button" @click="addListedIp">{{ trans.wafpanelAdd }}</button>
        </div>
        <div class="wafpanel-table">
          <div v-for="rule in currentList" :key="ipRuleValue(rule)" class="dnshub-domain-row">
            <code>{{ ipRuleValue(rule) }}</code>
            <button class="btn" type="button" @click="toggleIpState(rule)">{{ ipRuleState(rule) === 'on' ? trans.wafpanelEnabled : trans.wafpanelDisabled }}</button>
            <button class="btn btn-red" type="button" @click="removeListedIp(rule)">{{ trans.delete || '删除' }}</button>
          </div>
        </div>
      </div>

      <div v-else-if="page === 'autoban'" class="settings-section">
        <div class="section-title">{{ trans.wafpanelAutoban }}</div>
        <p class="dnshub-hint">{{ trans.wafpanelAutobanHint }}</p>
        <div class="dnshub-compact-grid">
          <div class="form-group">
            <label class="form-label">{{ trans.wafpanelProtection }}</label>
            <button class="btn" :class="ab.enabled ? 'btn-red' : 'btn-primary'" type="button" @click="toggleAutobanProtection">{{ ab.enabled ? trans.wafpanelDisableProtect : trans.wafpanelEnableProtect }}</button>
          </div>
          <div class="form-group">
            <label class="form-label">{{ trans.wafpanelPreset }}</label>
            <div style="display:flex;gap:8px">
              <button class="btn" type="button" @click="applyAutobanPreset('loose')">{{ trans.wafpanelLoose }}</button>
              <button class="btn" type="button" @click="applyAutobanPreset('standard')">{{ trans.wafpanelStandard }}</button>
              <button class="btn" type="button" @click="applyAutobanPreset('strict')">{{ trans.wafpanelStrict }}</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">{{ trans.wafpanelManualIp }}</label>
            <div style="display:flex;gap:8px">
              <input v-model="manualIp" class="form-input">
              <button class="btn btn-red" type="button" @click="manualAutoban('ban')">{{ trans.wafpanelBan }}</button>
              <button class="btn" type="button" @click="manualAutoban('unban')">{{ trans.wafpanelUnban }}</button>
            </div>
          </div>
        </div>
        <details class="wafpanel-advanced" open>
          <summary>{{ trans.wafpanelAdvanced }}</summary>
          <div class="dnshub-compact-grid" style="margin-top:12px">
            <label class="form-label"><input type="checkbox" v-model="ab.enabled"> {{ trans.wafpanelEnableProtect }}</label>
            <label class="form-label"><input type="checkbox" v-model="ab.local_ban"> {{ trans.wafpanelLocalFw }}</label>
            <label class="form-label"><input type="checkbox" v-model="ab.waf_blacklist"> {{ trans.wafpanelWriteBlack }}</label>
            <label class="form-label"><input type="checkbox" v-model="ab.cloudflare_ban"> Cloudflare</label>
            <div class="form-group"><label class="form-label">maxretry</label><input v-model.number="ab.maxretry" class="form-input" type="number" :disabled="mainJailLocked"></div>
            <div class="form-group"><label class="form-label">findtime</label><input v-model.number="ab.findtime" class="form-input" type="number" :disabled="mainJailLocked"></div>
            <div class="form-group"><label class="form-label">bantime</label><input v-model.number="ab.bantime" class="form-input" type="number" :disabled="mainJailLocked"></div>
            <div class="form-group"><label class="form-label">port</label><input v-model="ab.port" class="form-input" :disabled="mainJailLocked"></div>
            <div class="form-group"><label class="form-label">banaction</label><select v-model="ab.banaction" class="form-select" :disabled="mainJailLocked"><option>iptables-allports</option><option>iptables-multiport</option><option>firewallcmd-ipset</option><option>ufw</option></select></div>
            <div class="form-group"><label class="form-label">chain</label><input v-model="ab.chain" class="form-input" :disabled="mainJailLocked"></div>
            <div class="form-group"><label class="form-label">{{ trans.wafpanelJailName }}</label><input v-model="ab.jail_name" class="form-input" :disabled="mainJailLocked"></div>
            <div class="form-group"><label class="form-label">{{ trans.wafpanelFilterName }}</label><input v-model="ab.filter_name" class="form-input" :disabled="mainJailLocked"></div>
            <div class="form-group"><label class="form-label">{{ trans.wafpanelStatusCodes }}</label><input v-model="ab.statusCodesText" class="form-input" :disabled="mainJailLocked"></div>
            <div class="form-group" style="grid-column:1/-1"><label class="form-label">{{ trans.wafpanelLogpaths }}</label>
              <textarea v-model="ab.logpathsText" class="form-input" rows="4"></textarea>
              <p class="dnshub-hint">{{ detectedLogpathsText }}</p>
              <button class="btn" type="button" @click="detectAutobanLogpaths">{{ trans.wafpanelDetectLogs }}</button>
            </div>
            <div class="form-group" style="grid-column:1/-1"><label class="form-label">{{ trans.wafpanelIgnoreIps }}</label><textarea v-model="ab.ignoreIpsText" class="form-input" rows="3"></textarea></div>
            <div class="form-group" style="grid-column:1/-1"><label class="form-label">{{ trans.wafpanelIgnoreRegex }}</label><input v-model="ab.ignore_regex" class="form-input"></div>
            <div class="form-group"><label class="form-label">Cloudflare email</label><input v-model="ab.cloudflare_email" class="form-input"></div>
            <div class="form-group"><label class="form-label">Cloudflare API</label><input v-model="ab.cloudflare_api_key" class="form-input" type="password"></div>
            <div class="form-group"><label class="form-label">Cloudflare note</label><input v-model="ab.cloudflare_note" class="form-input"></div>
            <label class="form-label"><input type="checkbox" v-model="ab.cf_real_ip_enabled"> {{ trans.wafpanelRealIp }}</label>
            <div class="form-group"><label class="form-label">{{ trans.wafpanelRealIpHeader }}</label><input v-model="ab.real_ip_header" class="form-input"></div>
            <label class="form-label"><input type="checkbox" v-model="ab.real_ip_recursive"> {{ trans.wafpanelRealIpRecursive }}</label>
            <div class="form-group" style="grid-column:1/-1"><label class="form-label">{{ trans.wafpanelCfRanges }}</label><textarea v-model="ab.cfRangesText" class="form-input" rows="3"></textarea></div>
            <div class="dnshub-actions" style="grid-column:1/-1">
              <span class="text-sm">{{ mainJailGenerated ? trans.wafpanelMainJailOn : trans.wafpanelMainJailOff }}</span>
              <button class="btn" type="button" :disabled="!mainJailGenerated || !mainJailLocked" @click="mainJailLocked = false">{{ trans.wafpanelUnlockMainJail }}</button>
              <button class="btn btn-primary" type="button" :disabled="mainJailLocked" @click="saveMainJail">{{ trans.wafpanelSaveMainJail }}</button>
              <button class="btn" type="button" @click="refreshAutobanStatus">{{ trans.wafpanelRefreshStatus }}</button>
            </div>
          </div>
          <div class="wafpanel-resource-columns">
            <div>
              <div class="section-title">{{ trans.wafpanelJails }}</div>
              <button class="btn btn-primary" type="button" @click="editAutobanJail(-1)">{{ trans.wafpanelNewJail }}</button>
              <p class="dnshub-hint">{{ abDependency }}</p>
              <div v-for="(jail, index) in ab.jails" :key="jail.name + index" class="dnshub-domain-row">
                <label><input type="checkbox" v-model="jail.enabled"> {{ jail.name }} / {{ jail.filter }}</label>
                <span>{{ jail.maxretry }}/{{ jail.findtime }}/{{ jail.bantime }}</span>
                <span class="text-sm">{{ jailRuntimeText(jail.name) }}</span>
                <button class="btn" type="button" @click="editAutobanJail(index)">{{ trans.edit || '编辑' }}</button>
                <button class="btn" type="button" @click="copyAutobanJail(index)">{{ trans.wafpanelCopy }}</button>
                <button class="btn btn-red" type="button" @click="deleteAutobanJail(index)">{{ trans.delete || '删除' }}</button>
              </div>
              <div v-if="jailEditor" class="settings-section" style="margin-top:8px">
                <div class="section-title">{{ jailEditorIndex < 0 ? trans.wafpanelNewJail : trans.edit }}</div>
                <div class="dnshub-compact-grid">
                  <div class="form-group"><label class="form-label">{{ trans.wafpanelNodeName }}</label><input v-model="jailEditor.name" class="form-input"></div>
                  <div class="form-group"><label class="form-label">Filter</label>
                    <select v-model="jailEditor.filter" class="form-select">
                      <option v-for="item in abCatalog" :key="item.name" :value="item.name">{{ item.name }} · {{ item.owner === 'panel' ? trans.wafpanelPanelFilter : trans.wafpanelSystemFilter }}</option>
                    </select>
                  </div>
                  <div class="form-group"><label class="form-label">backend</label>
                    <select v-model="jailEditor.backend" class="form-select">
                      <option value="auto">auto</option>
                      <option value="systemd">systemd</option>
                    </select>
                  </div>
                  <div class="form-group"><label class="form-label">maxretry</label><input v-model.number="jailEditor.maxretry" class="form-input" type="number"></div>
                  <div class="form-group"><label class="form-label">findtime</label><input v-model.number="jailEditor.findtime" class="form-input" type="number"></div>
                  <div class="form-group"><label class="form-label">bantime</label><input v-model.number="jailEditor.bantime" class="form-input" type="number"></div>
                  <div class="form-group"><label class="form-label">port</label><input v-model="jailEditor.port" class="form-input"></div>
                  <div class="form-group"><label class="form-label">banaction</label>
                    <select v-model="jailEditor.banaction" class="form-select">
                      <option value="">{{ trans.wafpanelInherit }}</option>
                      <option>iptables-allports</option>
                      <option>iptables-multiport</option>
                      <option>firewallcmd-ipset</option>
                      <option>ufw</option>
                    </select>
                  </div>
                  <div class="form-group"><label class="form-label">chain</label><input v-model="jailEditor.chain" class="form-input"></div>
                  <div class="form-group" style="grid-column:1/-1"><label class="form-label">{{ trans.wafpanelLogpaths }}</label><textarea v-model="jailEditor.logpathsText" class="form-input" rows="3"></textarea></div>
                  <div class="form-group" style="grid-column:1/-1"><label class="form-label">{{ trans.wafpanelIgnoreIps }}</label><textarea v-model="jailEditor.ignoreIpsText" class="form-input" rows="2"></textarea></div>
                  <div class="form-group" style="grid-column:1/-1"><label class="form-label">journalmatch</label><input v-model="jailEditor.journalmatch" class="form-input"></div>
                  <label class="form-label"><input type="checkbox" v-model="jailEditor.enabled"> {{ trans.wafpanelEnabled }}</label>
                  <label class="form-label"><input type="checkbox" v-model="jailEditor.local_ban"> {{ trans.wafpanelLocalFw }}</label>
                  <label class="form-label"><input type="checkbox" v-model="jailEditor.waf_blacklist"> {{ trans.wafpanelWriteBlack }}</label>
                  <label class="form-label"><input type="checkbox" v-model="jailEditor.cloudflare_ban"> Cloudflare</label>
                </div>
                <div class="dnshub-actions">
                  <button class="btn btn-primary" type="button" @click="commitAutobanJail">{{ trans.wafpanelWriteDraft }}</button>
                  <button class="btn" type="button" @click="jailEditor = null">{{ trans.dnshubCancelEdit }}</button>
                </div>
              </div>
            </div>
            <div>
              <div class="section-title">{{ trans.wafpanelFilters }}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn" type="button" @click="showSystemFilters">{{ trans.wafpanelSystemFilters }}</button>
                <button class="btn btn-primary" type="button" @click="editAutobanFilter('')">{{ trans.wafpanelNewFilter }}</button>
              </div>
              <div v-for="item in panelFilters" :key="item.name" class="dnshub-domain-row">
                <strong>{{ item.name }}</strong>
                <span class="text-muted text-sm">{{ (item.used_by || []).join(', ') || trans.wafpanelUnused }}</span>
                <button class="btn" type="button" @click="editAutobanFilter(item.name)">{{ trans.edit || '编辑' }}</button>
                <button class="btn" type="button" @click="copyAutobanFilter(item.name)">{{ trans.wafpanelCopy }}</button>
                <button class="btn btn-red" type="button" @click="deleteAutobanFilter(item.name)">{{ trans.delete || '删除' }}</button>
              </div>
              <div v-if="filterEditor" class="settings-section" style="margin-top:8px">
                <div class="section-title">{{ filterEditorOldName ? trans.edit : trans.wafpanelNewFilter }}</div>
                <div class="form-group"><label class="form-label">{{ trans.wafpanelNodeName }}</label><input v-model="filterEditor.name" class="form-input"></div>
                <div class="form-group"><label class="form-label">failregex</label><textarea v-model="filterEditor.failregex" class="form-input" rows="4"></textarea></div>
                <div class="form-group"><label class="form-label">ignoreregex</label><textarea v-model="filterEditor.ignoreregex" class="form-input" rows="3"></textarea></div>
                <div class="form-group"><label class="form-label">{{ trans.wafpanelFilterSample }}</label><textarea v-model="filterSample" class="form-input" rows="3"></textarea></div>
                <pre v-if="filterTestResult" class="text-sm">{{ filterTestResult }}</pre>
                <div class="dnshub-actions">
                  <button class="btn" type="button" @click="testAutobanFilter">{{ trans.wafpanelTestFilter }}</button>
                  <button class="btn btn-primary" type="button" @click="commitAutobanFilter">{{ trans.wafpanelWriteDraft }}</button>
                  <button class="btn" type="button" @click="filterEditor = null">{{ trans.dnshubCancelEdit }}</button>
                </div>
              </div>
              <div v-if="systemFiltersOpen" class="settings-section" style="margin-top:8px">
                <div class="section-title">{{ trans.wafpanelSystemFilters }}</div>
                <input v-model="systemFilterQuery" class="form-input" :placeholder="trans.wafpanelSearch">
                <div v-for="item in visibleSystemFilters" :key="item.name" class="dnshub-domain-row">
                  <strong>{{ item.name }}</strong>
                  <span class="text-muted text-sm">{{ trans.wafpanelReadOnly }} · {{ (item.used_by || []).join(', ') || trans.wafpanelUnused }}</span>
                </div>
                <button class="btn" type="button" @click="systemFiltersOpen = false">{{ trans.wafpanelBack }}</button>
              </div>
            </div>
          </div>
          <div class="dnshub-actions" style="margin-top:12px">
            <button class="btn" type="button" @click="previewAutobanConfig">{{ trans.wafpanelPreviewFiles }}</button>
            <button class="btn" type="button" @click="validateAutobanDraft">{{ trans.wafpanelValidateDraft }}</button>
            <button class="btn" type="button" @click="exportAutobanConfig">{{ trans.wafpanelExportJson }}</button>
            <label class="btn">{{ trans.wafpanelImportJson }}<input type="file" accept="application/json" hidden @change="importAutobanConfig"></label>
            <button class="btn btn-primary" type="button" @click="saveAutoban">{{ trans.wafpanelSaveNoRestart }}</button>
            <button class="btn btn-red" type="button" @click="restartAutoban">{{ trans.wafpanelApplyRestart }}</button>
          </div>
          <pre v-if="abPreview" class="text-sm" style="margin-top:12px">{{ abPreview }}</pre>
          <pre v-if="abStatus" class="text-sm" style="margin-top:12px">{{ abStatus }}</pre>
        </details>
      </div>

      <div v-else-if="page === 'pages'" class="settings-section">
        <div class="section-title">{{ trans.wafpanelPages }}</div>
        <div v-if="!editingPage" class="wafpanel-table">
          <div v-for="item in pages" :key="item.name" class="dnshub-domain-row">
            <code>{{ item.name }}</code>
            <span>{{ ((item.size || 0) / 1024).toFixed(1) }}KB</span>
            <span>{{ item.mtime ? new Date(item.mtime * 1000).toLocaleString() : '' }}</span>
            <button class="btn btn-primary" type="button" @click="editPage(item.name)">{{ trans.edit || '编辑' }}</button>
          </div>
        </div>
        <div v-else>
          <div class="section-title">{{ trans.edit || '编辑' }}: {{ editingPage }}</div>
          <textarea v-model="pageContent" class="form-input" rows="18" style="font-family:monospace"></textarea>
          <div class="dnshub-actions" style="margin-top:8px">
            <button class="btn btn-primary" type="button" @click="savePage">{{ trans.wafpanelSaveReload }}</button>
            <button class="btn" type="button" @click="reloadNginx">{{ trans.wafpanelReload }}</button>
            <button class="btn" type="button" @click="editingPage = ''">{{ trans.wafpanelBack }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { http } from '../../../utils/http'
import { buildAdminViewQuery, parseAdminViewQuery } from '../../../utils/adminView.js'
import { getPublicAssetUrl } from '../../../utils/config.js'

const props = defineProps({
  trans: { type: Object, required: true },
  activeTab: { type: String, default: '' },
  selectedApiIndex: { type: Number, default: 0 }
})

const route = useRoute()
const router = useRouter()
const initialView = parseAdminViewQuery(route.query)
const page = ref(initialView.wafPage)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const nodes = ref([])
const currentNode = ref(null)
const dashboard = ref({})
const mapPoints = ref([])
const logs = ref([])
const logsTotal = ref(0)
const logPage = ref(1)
const logPages = ref(1)
const logSearch = ref('')
const logDetail = ref(null)
const bans = ref([])
const banPage = ref(1)
const banPages = ref(1)
const wafRules = ref({})
const ccForm = reactive({ state: 'off', threshold: 120, duration: 60, ipBlockTime: 600 })
const blacklist = ref({ ipBlack: [], ipWhite: [] })
const listType = ref('black')
const newIp = ref('')
const pages = ref([])
const editingPage = ref('')
const pageContent = ref('')
const editingId = ref('')
const nodeForm = reactive({ name: '', url: '', token: '' })
const geo = reactive({ state: 'off', action: 'deny', rules: [] })
const geoRulesText = ref('')
const asnQuery = ref('')
const asnResult = ref({})
const manualIp = ref('')
const abStatus = ref('')
const abPreview = ref('')
const abCatalog = ref([])
const jailStatuses = ref({})
const mainJailGenerated = ref(false)
const mainJailLocked = ref(false)
const detectedLogpaths = ref([])
const jailEditor = ref(null)
const jailEditorIndex = ref(-1)
const filterEditor = ref(null)
const filterEditorOldName = ref('')
const filterSample = ref('')
const filterTestResult = ref('')
const systemFiltersOpen = ref(false)
const systemFilterQuery = ref('')
const ab = reactive({
  enabled: false,
  local_ban: true,
  waf_blacklist: true,
  cloudflare_ban: false,
  maxretry: 5,
  findtime: 600,
  bantime: 3600,
  port: '80,443',
  banaction: 'iptables-allports',
  chain: 'INPUT',
  jail_name: 'waf-panel-autoban',
  filter_name: 'waf-panel-autoban',
  logpathsText: '',
  ignoreIpsText: '127.0.0.1/8',
  cloudflare_email: '',
  cloudflare_api_key: '',
  cloudflare_note: '',
  ignore_regex: '',
  statusCodesText: '403,444,500,502,503',
  cf_real_ip_enabled: false,
  real_ip_header: 'CF-Connecting-IP',
  real_ip_recursive: false,
  cfRangesText: '',
  jails: [],
  custom_filters: [],
  raw: {}
})

const RULE_NAMES = {
  waf: 'WAF', xss: 'XSS', sql: 'SQL', cc: 'CC', urlcc: 'URL CC', attackCount: '攻击次数',
  notFoundCount: '404', cookie: 'Cookie', header: 'Header', args: '参数', fileExt: '扩展名',
  methodWhite: '方法白名单', vuln: '漏洞', strict: '严格模式', bot: 'Bot', app: '应用',
  geoRestrict: '地区', allowSpider: '爬虫白名单', ipWhite: 'IP白名单', ipBlack: 'IP黑名单',
  urlWhite: 'URL白名单', urlBlack: 'URL黑名单', uaWhite: 'UA白名单', uaBlack: 'UA黑名单'
}
const wafpanelPages = computed(() => [
  { id: 'dashboard', label: props.trans.wafpanelDashboard },
  { id: 'logs', label: props.trans.wafpanelLogs },
  { id: 'bans', label: props.trans.wafpanelBans },
  { id: 'autoban', label: props.trans.wafpanelAutoban },
  { id: 'pages', label: props.trans.wafpanelPages }
])
const todayStat = computed(() => (dashboard.value.waf_stat && dashboard.value.waf_stat[0]) || {})
const currentList = computed(() => listType.value === 'white' ? (blacklist.value.ipWhite || []) : (blacklist.value.ipBlack || []))
const panelFilters = computed(() => (abCatalog.value || []).filter((item) => item.owner === 'panel'))
const visibleSystemFilters = computed(() => {
  const q = systemFilterQuery.value.trim().toLowerCase()
  return (abCatalog.value || []).filter((item) => item.owner === 'system' && item.name.toLowerCase().includes(q))
})
const abDependency = computed(() => {
  const missing = (ab.jails || []).filter((jail) => !(abCatalog.value || []).some((item) => item.name === jail.filter))
  if (!missing.length) return `${ab.jails.length} Jail 依赖正常`
  return `依赖异常：${missing.map((jail) => `${jail.name} → ${jail.filter}`).join('，')}`
})
const detectedLogpathsText = computed(() => (detectedLogpaths.value || []).length
  ? `${props.trans.wafpanelDetected}: ${detectedLogpaths.value.join(' / ')}`
  : props.trans.wafpanelDetectedDefault)
const currentNodeUnreachable = computed(() => !!currentNode.value && currentNode.value.online === false && currentNode.value.status !== 'unknown')
const ruleList = computed(() => Object.keys(wafRules.value || {})
  .filter((key) => wafRules.value[key] && typeof wafRules.value[key] === 'object' && 'state' in wafRules.value[key])
  .map((key) => ({ key, label: RULE_NAMES[key] || key, state: wafRules.value[key].state || 'off' })))

let mapInstance = null

const unwrap = (result) => {
  if (result?.error && result.status && result.status >= 400) throw new Error(result.message || result.error)
  if (result?.error && !result.data) throw new Error(result.message || result.error)
  const body = result?.data || {}
  if (body && body.error && body.message) throw new Error(body.message)
  return body
}
const requestGet = (url) => http.getByIndex(url, props.selectedApiIndex)
const requestPost = (url, body) => http.postByIndex(url, body, props.selectedApiIndex)
const requestPatch = (url, body) => http.patchByIndex(url, body, props.selectedApiIndex)
const requestDelete = (url) => http.deleteByIndex(url, props.selectedApiIndex)
const agentPath = (suffix) => `/api/wafpanel/nodes/${currentNode.value.id}${suffix.startsWith('/') ? suffix : '/' + suffix}`
const agentGet = async (suffix) => {
  if (!currentNode.value?.id) throw new Error(props.trans.wafpanelSelectNode)
  return unwrap(await requestGet(agentPath(suffix)))
}
const agentPost = async (suffix, body) => {
  if (!currentNode.value?.id) throw new Error(props.trans.wafpanelSelectNode)
  return unwrap(await requestPost(agentPath(suffix), body))
}
const toast = (msg, isError = false) => {
  if (isError) { error.value = msg; notice.value = '' }
  else { notice.value = msg; error.value = '' }
}

const ipRuleValue = (rule) => {
  if (typeof rule === 'string') return rule
  if (!rule || typeof rule !== 'object') return ''
  if (rule.type === 'ipv4') return rule.ipv4 || ''
  if (rule.type === 'ipv6') return rule.ipv6 || ''
  if (rule.type === 'ipGroup') return rule.ipGroup || ''
  if (rule.type === 'ipArr') return `${rule.ipStart || ''}-${rule.ipEnd || ''}`
  return rule.ipv4 || rule.ipv6 || rule.ipGroup || ''
}
const ipRuleState = (rule) => (!rule || typeof rule === 'string') ? 'on' : (rule.state === 'off' ? 'off' : 'on')

const syncView = (next = {}) => {
  const query = buildAdminViewQuery(route.query, {
    tab: 'wafpanel',
    wafPage: page.value,
    wafNode: currentNode.value?.id || '',
    ...next
  })
  const same = Object.keys(query).every((key) => String(query[key] ?? '') === String(route.query[key] ?? ''))
    && Object.keys(route.query).every((key) => String(query[key] ?? '') === String(route.query[key] ?? ''))
  if (same) return
  router.replace({ path: '/admin', query })
}

const loadNodes = async (probe = false) => {
  const result = unwrap(await requestGet(probe ? '/api/wafpanel/nodes?probe=1' : '/api/wafpanel/nodes'))
  nodes.value = Array.isArray(result) ? result : (result.data || result || [])
}
const probeNodes = async () => {
  loading.value = true
  error.value = ''
  try {
    await loadNodes(true)
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}
const nodeStatusText = (item) => {
  if (item.status === 'ok' || item.online === true) return props.trans.wafpanelOnline
  if (item.status === 'auth') return props.trans.wafpanelAuthFail
  if (item.status === 'offline' || item.online === false) return item.message || props.trans.wafpanelOffline
  return props.trans.wafpanelUnknown
}
const nodeStatusColor = (item) => {
  if (item.status === 'ok' || item.online === true) return 'var(--accent-green)'
  if (item.status === 'auth' || item.online === false) return 'var(--accent-red)'
  return 'var(--text-muted)'
}

const ensureLeaflet = () => new Promise((resolve) => {
  if (window.L) return resolve(window.L)
  if (!document.querySelector('link[data-wafpanel-leaflet]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = getPublicAssetUrl('files/leaflet.css')
    link.setAttribute('data-wafpanel-leaflet', '1')
    document.head.appendChild(link)
  }
  const existing = document.querySelector('script[data-wafpanel-leaflet]')
  if (existing) {
    if (window.L) return resolve(window.L)
    existing.addEventListener('load', () => resolve(window.L), { once: true })
    return
  }
  const script = document.createElement('script')
  script.src = getPublicAssetUrl('files/leaflet.js')
  script.setAttribute('data-wafpanel-leaflet', '1')
  script.onload = () => resolve(window.L)
  document.head.appendChild(script)
})

const renderMap = async () => {
  await nextTick()
  const el = document.getElementById('wafpanel-map')
  if (!el) return
  const L = await ensureLeaflet()
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
  if (!mapPoints.value.length) {
    el.innerHTML = `<div class="empty">${props.trans.wafpanelNoMap}</div>`
    return
  }
  mapInstance = L.map(el, { scrollWheelZoom: false }).setView([30, 20], 2)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB', maxZoom: 18 }).addTo(mapInstance)
  mapPoints.value.forEach((p) => {
    L.circleMarker([p.lat, p.lon], {
      radius: Math.min(20, 6 + Math.log((p.count || 1) + 1) * 3),
      fillColor: '#dc2626',
      color: '#991b1b',
      weight: 1,
      fillOpacity: 0.7
    }).addTo(mapInstance).bindPopup(`${p.ip}<br>${p.country || ''} ${p.city || ''}<br>${p.count}`)
  })
}

const loadDashboard = async () => {
  const [d, mapData, geoCfg, rules] = await Promise.all([
    agentGet('/dashboard'),
    agentGet('/map'),
    agentGet('/geo_config'),
    agentGet('/rules')
  ])
  dashboard.value = d
  mapPoints.value = mapData.points || []
  Object.assign(geo, { state: geoCfg.state || 'off', action: geoCfg.action || 'deny', rules: geoCfg.rules || [] })
  geoRulesText.value = (geo.rules || []).join(',')
  wafRules.value = rules || {}
  if (rules?.cc) Object.assign(ccForm, { state: rules.cc.state || 'off', threshold: rules.cc.threshold || 120, duration: rules.cc.duration || 60, ipBlockTime: rules.cc.ipBlockTime || 600 })
  await renderMap()
}

const loadLogs = async (pageNo = 1) => {
  const result = await agentGet(`/logs?page=${pageNo}&limit=20&search=${encodeURIComponent(logSearch.value || '')}`)
  logs.value = result.data || []
  logsTotal.value = result.total || logs.value.length
  logPage.value = result.page || pageNo
  logPages.value = result.pages || Math.max(1, Math.ceil((logsTotal.value || 1) / (result.limit || 20)))
}

const loadBans = async (pageNo = 1) => {
  const [blocks, list] = await Promise.all([agentGet(`/blocks?page=${pageNo}&limit=30`), agentGet('/blacklist')])
  bans.value = blocks.data || []
  banPage.value = blocks.page || pageNo
  banPages.value = blocks.pages || Math.max(1, Math.ceil((blocks.total || bans.value.length || 1) / (blocks.limit || 30)))
  blacklist.value = { ipBlack: list.ipBlack || [], ipWhite: list.ipWhite || [] }
}

const fillAutoban = (cfg = {}) => {
  Object.assign(ab, {
    enabled: !!cfg.enabled,
    local_ban: cfg.local_ban !== false,
    waf_blacklist: cfg.waf_blacklist !== false,
    cloudflare_ban: !!cfg.cloudflare_ban,
    maxretry: cfg.maxretry || 5,
    findtime: cfg.findtime || 600,
    bantime: cfg.bantime || 3600,
    port: cfg.port || '80,443',
    banaction: cfg.banaction || 'iptables-allports',
    chain: cfg.chain || 'INPUT',
    jail_name: cfg.jail_name || 'waf-panel-autoban',
    filter_name: cfg.filter_name || 'waf-panel-autoban',
    logpathsText: (cfg.logpaths || []).join('\n'),
    ignoreIpsText: (cfg.ignore_ips || []).join('\n'),
    cloudflare_email: cfg.cloudflare_email || '',
    cloudflare_api_key: cfg.cloudflare_api_key || '',
    cloudflare_note: cfg.cloudflare_note || '',
    ignore_regex: cfg.ignore_regex || '',
    statusCodesText: (cfg.status_codes || []).join(',') || '403,444,500,502,503',
    cf_real_ip_enabled: !!cfg.cf_real_ip_enabled,
    real_ip_header: cfg.real_ip_header || 'CF-Connecting-IP',
    real_ip_recursive: !!cfg.real_ip_recursive,
    cfRangesText: (cfg.cf_real_ip_ranges || []).join('\n'),
    jails: JSON.parse(JSON.stringify(cfg.jails || [])),
    custom_filters: JSON.parse(JSON.stringify(cfg.custom_filters || [])),
    raw: cfg
  })
}

const autobanPayload = () => ({
  ...ab.raw,
  enabled: ab.enabled,
  local_ban: ab.local_ban,
  waf_blacklist: ab.waf_blacklist,
  cloudflare_ban: ab.cloudflare_ban,
  maxretry: ab.maxretry,
  findtime: ab.findtime,
  bantime: ab.bantime,
  port: ab.port,
  banaction: ab.banaction,
  chain: ab.chain,
  jail_name: ab.jail_name,
  filter_name: ab.filter_name,
  logpaths: ab.logpathsText.split('\n').map((x) => x.trim()).filter(Boolean),
  ignore_ips: ab.ignoreIpsText.split('\n').map((x) => x.trim()).filter(Boolean),
  cloudflare_email: ab.cloudflare_email,
  cloudflare_api_key: ab.cloudflare_api_key,
  cloudflare_note: ab.cloudflare_note,
  ignore_regex: ab.ignore_regex,
  status_codes: ab.statusCodesText.split(',').map((x) => x.trim()).filter(Boolean),
  cf_real_ip_enabled: !!ab.cf_real_ip_enabled,
  real_ip_header: ab.real_ip_header,
  real_ip_recursive: !!ab.real_ip_recursive,
  cf_real_ip_ranges: ab.cfRangesText.split('\n').map((x) => x.trim()).filter(Boolean),
  jails: ab.jails,
  custom_filters: ab.custom_filters
})

const loadAutoban = async () => {
  const [d, catalog] = await Promise.all([agentGet('/autoban_config'), agentGet('/autoban_catalog')])
  fillAutoban(d.config || {})
  abCatalog.value = catalog.filters || []
  abStatus.value = translateFail2banOutput(d.status?.output || '')
  detectedLogpaths.value = d.detected_logpaths || []
  mainJailGenerated.value = !!d.main_jail_generated
  mainJailLocked.value = !!d.main_jail_generated
  jailEditor.value = null
  filterEditor.value = null
  await refreshAutobanJailStatuses()
}

const translateFail2banOutput = (text) => String(text || '')
  .replace(/Status for the jail/gi, 'Jail 状态')
  .replace(/Currently banned/gi, '当前封禁')
  .replace(/Total banned/gi, '累计封禁')
  .replace(/Banned IP list/gi, '封禁 IP 列表')
  .replace(/File list/gi, '文件列表')
  .replace(/Jail list/gi, 'Jail 列表')

const jailRuntimeText = (name) => {
  const status = jailStatuses.value[name]
  if (!status) return props.trans.wafpanelJailIdle
  if (status.running) return `${props.trans.wafpanelJailRunning} ${status.currently_banned || 0}/${status.total_banned || 0}`
  return props.trans.wafpanelJailIdle
}

const refreshAutobanJailStatuses = async () => {
  const next = {}
  await Promise.all((ab.jails || []).map(async (jail) => {
    try {
      next[jail.name] = await agentGet(`/autoban_jails/${encodeURIComponent(jail.name)}/status`)
    } catch {
      next[jail.name] = { running: false }
    }
  }))
  jailStatuses.value = next
}

const refreshAutobanStatus = async () => {
  const r = await agentGet('/autoban_status')
  abStatus.value = translateFail2banOutput(r?.output || '')
}

const detectAutobanLogpaths = async () => {
  const r = await agentGet('/autoban_config')
  const paths = r.detected_logpaths || []
  detectedLogpaths.value = paths
  ab.logpathsText = paths.join('\n')
  toast(paths.length ? props.trans.wafpanelDetectFilled : props.trans.wafpanelDetectDefault)
}

const saveMainJail = async () => {
  await saveAutoban()
  mainJailLocked.value = true
}

const syncAutobanCatalog = () => {
  const system = (abCatalog.value || []).filter((item) => item.owner === 'system')
  const panel = (ab.custom_filters || []).map((item) => ({
    name: item.name,
    owner: 'panel',
    used_by: (ab.jails || []).filter((jail) => jail.filter === item.name).map((jail) => jail.name),
    definition: item
  }))
  abCatalog.value = [...system, ...panel].sort((a, b) => a.name.localeCompare(b.name))
}

const emptyJail = () => ({
  enabled: false,
  name: '',
  filter: abCatalog.value[0]?.name || '',
  backend: 'auto',
  journalmatch: '',
  maxretry: 5,
  findtime: 600,
  bantime: 3600,
  port: '',
  chain: '',
  banaction: '',
  logpathsText: '',
  ignoreIpsText: '',
  local_ban: false,
  waf_blacklist: false,
  cloudflare_ban: false
})

const editAutobanJail = (index) => {
  jailEditorIndex.value = index
  const source = index < 0 ? emptyJail() : ab.jails[index]
  jailEditor.value = {
    ...emptyJail(),
    ...source,
    logpathsText: Array.isArray(source.logpaths) ? source.logpaths.join('\n') : (source.logpathsText || ''),
    ignoreIpsText: Array.isArray(source.ignore_ips) ? source.ignore_ips.join('\n') : (source.ignoreIpsText || '')
  }
}

const commitAutobanJail = () => {
  const editor = jailEditor.value
  if (!editor?.name?.trim()) return toast('Jail 名称不能为空', true)
  if (editor.backend === 'systemd' && !editor.journalmatch) return toast('systemd 日志来源需要 journalmatch', true)
  const jail = {
    enabled: !!editor.enabled,
    name: editor.name.trim(),
    filter: editor.filter,
    backend: editor.backend || 'auto',
    journalmatch: editor.journalmatch || '',
    maxretry: editor.maxretry,
    findtime: editor.findtime,
    bantime: editor.bantime,
    port: editor.port || '',
    chain: editor.chain || '',
    banaction: editor.banaction || '',
    logpaths: (editor.logpathsText || '').split('\n').map((x) => x.trim()).filter(Boolean),
    ignore_ips: (editor.ignoreIpsText || '').split('\n').map((x) => x.trim()).filter(Boolean),
    local_ban: !!editor.local_ban,
    waf_blacklist: !!editor.waf_blacklist,
    cloudflare_ban: !!editor.cloudflare_ban
  }
  if (jailEditorIndex.value < 0) ab.jails.push(jail)
  else ab.jails[jailEditorIndex.value] = jail
  jailEditor.value = null
  syncAutobanCatalog()
}

const copyAutobanJail = (index) => {
  const jail = JSON.parse(JSON.stringify(ab.jails[index] || {}))
  jail.name = `${jail.name || 'jail'}-copy`
  jail.enabled = false
  ab.jails.push(jail)
  syncAutobanCatalog()
}

const deleteAutobanJail = async (index) => {
  const jail = ab.jails[index]
  let detail = '当前未运行或尚未应用'
  try {
    const status = await agentGet(`/autoban_jails/${encodeURIComponent(jail.name)}/status`)
    if (status?.running) detail = `当前运行中，封禁 ${status.currently_banned || 0} 个 IP`
  } catch {}
  if (!window.confirm(`删除 Jail ${jail.name}？\n${detail}`)) return
  ab.jails.splice(index, 1)
  syncAutobanCatalog()
}

const editAutobanFilter = (name) => {
  const found = (ab.custom_filters || []).find((item) => item.name === name)
  filterEditorOldName.value = name || ''
  filterEditor.value = { name: found?.name || '', failregex: found?.failregex || '', ignoreregex: found?.ignoreregex || '' }
  filterSample.value = ''
  filterTestResult.value = ''
}

const commitAutobanFilter = () => {
  const editor = filterEditor.value
  if (!editor) return
  const name = (editor.name || '').trim()
  const failregex = (editor.failregex || '').trim()
  if (!name || !failregex) return toast('名称和 failregex 不能为空', true)
  if (!/^[A-Za-z0-9_-]+$/.test(name) || !failregex.includes('<HOST>')) return toast('名称格式无效或 failregex 缺少 <HOST>', true)
  if ((abCatalog.value || []).some((item) => item.name === name && item.name !== filterEditorOldName.value)) return toast('Filter 名称已存在', true)
  const next = { name, failregex, ignoreregex: editor.ignoreregex || '' }
  const index = ab.custom_filters.findIndex((item) => item.name === filterEditorOldName.value)
  if (index < 0) ab.custom_filters.push(next)
  else {
    ab.custom_filters[index] = next
    if (filterEditorOldName.value && filterEditorOldName.value !== name) {
      ab.jails.forEach((jail) => {
        if (jail.filter === filterEditorOldName.value) jail.filter = name
      })
    }
  }
  filterEditor.value = null
  syncAutobanCatalog()
}

const copyAutobanFilter = (name) => {
  const found = (ab.custom_filters || []).find((item) => item.name === name)
  if (!found) return
  let copy = `${name}-copy`
  let n = 2
  while ((abCatalog.value || []).some((item) => item.name === copy)) {
    copy = `${name}-copy-${n}`
    n += 1
  }
  ab.custom_filters.push({ ...found, name: copy })
  syncAutobanCatalog()
}

const deleteAutobanFilter = (name) => {
  const used = (ab.jails || []).filter((jail) => jail.filter === name).map((jail) => jail.name)
  if (used.length) return toast(`此 Filter 正被以下 Jail 使用：${used.join(', ')}`, true)
  if (!window.confirm(`删除 Filter ${name}？`)) return
  ab.custom_filters = ab.custom_filters.filter((item) => item.name !== name)
  syncAutobanCatalog()
}

const showSystemFilters = () => {
  systemFiltersOpen.value = true
}

const testAutobanFilter = async () => {
  const r = await agentPost('/autoban_filter_test', {
    filter: {
      name: filterEditor.value?.name || '',
      failregex: filterEditor.value?.failregex || '',
      ignoreregex: filterEditor.value?.ignoreregex || ''
    },
    sample: filterSample.value
  })
  filterTestResult.value = r?.ok
    ? `测试命中：${r.matches || 0}\n提取 IP：${(r.hosts || []).join(', ') || '无'}\n\n${r.output || ''}`
    : (r.output || r.detail || r.message || '测试失败')
}

const previewAutobanConfig = async () => {
  const r = await agentPost('/autoban_preview', autobanPayload())
  if (!r?.ok && r?.jail_local == null) return toast(r.detail || r.message || '预览失败', true)
  abPreview.value = ['# waf-panel-autoban.local', r.jail_local || '', ...Object.entries(r.filters || {}).flatMap(([name, text]) => ['', `# filter.d/${name}.conf`, text])].join('\n')
}

const validateAutobanDraft = async () => {
  const r = await agentPost('/autoban_validate', autobanPayload())
  toast(r?.ok ? '草稿校验通过' : (r.detail || r.message || '草稿校验失败'), !r?.ok)
}

const exportAutobanConfig = () => {
  const blob = new Blob([JSON.stringify(autobanPayload(), null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'waf-panel-autoban.json'
  link.click()
  URL.revokeObjectURL(link.href)
}

const importAutobanConfig = async (event) => {
  const file = event.target?.files?.[0]
  if (!file) return
  try {
    const cfg = JSON.parse(await file.text())
    const r = await agentPost('/autoban_validate', cfg)
    if (!r?.ok && !r?.config) throw new Error(r.detail || r.message || '校验失败')
    fillAutoban(r.config || cfg)
    syncAutobanCatalog()
    toast('配置已导入草稿，尚未保存')
  } catch (err) {
    toast(`导入失败：${err.message || err}`, true)
  } finally {
    event.target.value = ''
  }
}

const loadPages = async () => {
  const d = await agentGet('/pages')
  pages.value = d.pages || []
}

const loadPageData = async () => {
  if (!currentNode.value) return
  if (currentNodeUnreachable.value) return
  error.value = ''
  try {
    if (page.value === 'dashboard') await loadDashboard()
    if (page.value === 'logs') await loadLogs(logPage.value || 1)
    if (page.value === 'bans') await loadBans(banPage.value || 1)
    if (page.value === 'autoban') await loadAutoban()
    if (page.value === 'pages') await loadPages()
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const retryCurrentNode = async () => {
  await loadNodes(true)
  const item = nodes.value.find((node) => node.id === currentNode.value?.id)
  if (item) currentNode.value = item
  await loadPageData()
}

const toggleRule = async (rule, state) => {
  const r = await agentPost('/rule_toggle', { rule, state })
  toast(r.message || '已更新')
  await loadDashboard()
}

const saveCc = async () => {
  const r = await agentPost('/cc_config', { ...ccForm })
  toast(r.message || '已保存')
  await loadDashboard()
}

const goNodes = () => {
  page.value = 'nodes'
  currentNode.value = null
  syncView({ wafPage: 'nodes', wafNode: '' })
}
const setPage = async (next) => {
  page.value = next
  editingPage.value = ''
  syncView({ wafPage: next, wafNode: currentNode.value?.id || '' })
  await loadPageData()
}
const openNode = async (item, nextPage = 'dashboard') => {
  currentNode.value = item
  page.value = nextPage
  syncView({ wafPage: nextPage, wafNode: item.id })
  await loadPageData()
}

const saveGeo = async () => {
  const rules = geoRulesText.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const r = await agentPost('/geo_config', { state: geo.state, action: geo.action, rules })
  toast(r.message || '已保存')
}
const lookupASN = async () => {
  asnResult.value = await agentGet(`/asn_lookup?asn=${encodeURIComponent(asnQuery.value)}`)
}
const blockASN = async () => {
  if (!window.confirm(props.trans.wafpanelBlockAsn)) return
  const r = await agentPost('/asn_block', { prefixes: asnResult.value.prefixes || [] })
  toast(r.message || '已添加')
}
const addBlack = async (ip) => {
  const r = await agentPost('/blacklist_add', { ip, type: 'black' })
  toast(r.message || '已添加')
}
const toggleLogBan = async (row, banType, banned) => {
  const r = await agentPost('/log_ban', { log_id: row.last_id || row.id || 0, ip: row.ip, ban_type: banType, banned })
  toast(r.message || '已更新')
  await loadLogs(logPage.value)
}
const showDetail = async (row) => {
  if (row.last_id) logDetail.value = await agentGet(`/log_detail?id=${row.last_id}`)
  else logDetail.value = row
}
const unblock = async (row) => {
  const r = await agentPost('/unblock', { id: row.id })
  toast(r.message || '已解封')
  await loadBans(banPage.value)
}
const addListedIp = async () => {
  const r = await agentPost('/blacklist_add', { ip: newIp.value.trim(), type: listType.value })
  toast(r.message || '已添加')
  newIp.value = ''
  await loadBans(banPage.value)
}
const removeListedIp = async (rule) => {
  const r = await agentPost('/blacklist_remove', { ip: ipRuleValue(rule), type: listType.value })
  toast(r.message || '已移除')
  await loadBans(banPage.value)
}
const toggleIpState = async (rule) => {
  const next = ipRuleState(rule) === 'on' ? 'off' : 'on'
  const r = await agentPost('/blacklist_state', { ip: ipRuleValue(rule), type: listType.value, state: next })
  toast(r.message || '状态已更新')
  await loadBans(banPage.value)
}
const saveAutoban = async () => {
  const r = await agentPost('/autoban_config', autobanPayload())
  toast(r.message || '已保存')
  await loadAutoban()
}
const restartAutoban = async () => {
  await saveAutoban()
  const r = await agentPost('/autoban_restart', {})
  toast(r.ok ? 'fail2ban 已重启' : (r.output || '重启失败'), !r.ok)
}
const toggleAutobanProtection = async () => {
  if (ab.enabled) {
    if (!window.confirm(props.trans.wafpanelDisableProtect)) return
    ab.enabled = false
  } else {
    ab.enabled = true
    ab.local_ban = true
    ab.waf_blacklist = true
  }
  await restartAutoban()
}
const applyAutobanPreset = async (name) => {
  const map = { loose: { maxretry: 8, findtime: 300, bantime: 1800 }, standard: { maxretry: 5, findtime: 600, bantime: 3600 }, strict: { maxretry: 3, findtime: 600, bantime: 86400 } }
  Object.assign(ab, map[name] || {})
  await restartAutoban()
}
const manualAutoban = async (op) => {
  const r = await agentPost(op === 'ban' ? '/autoban_ban' : '/autoban_unban', { ip: manualIp.value.trim() })
  toast(r.ok ? (op === 'ban' ? '已封禁' : '已解封') : '操作失败', !r.ok)
}
const editPage = async (name) => {
  const d = await agentGet(`/page_get?name=${encodeURIComponent(name)}`)
  editingPage.value = name
  pageContent.value = d.content || ''
}
const savePage = async () => {
  const r = await agentPost('/page_save', { name: editingPage.value, content: pageContent.value })
  toast(r.message || '已保存')
}
const reloadNginx = async () => {
  const r = await agentPost('/reload', {})
  toast(r.message || (r.ok ? '已重载' : (r.output || '重载失败')), !r.ok)
}

const startEdit = (item) => {
  editingId.value = item.id
  nodeForm.name = item.name
  nodeForm.url = item.url
  nodeForm.token = ''
}
const cancelEdit = () => {
  editingId.value = ''
  nodeForm.name = ''
  nodeForm.url = ''
  nodeForm.token = ''
}
const saveNode = async () => {
  loading.value = true
  error.value = ''
  try {
    if (editingId.value) unwrap(await requestPatch(`/api/wafpanel/nodes/${editingId.value}`, { ...nodeForm }))
    else unwrap(await requestPost('/api/wafpanel/nodes', { ...nodeForm }))
    cancelEdit()
    await loadNodes(true)
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}
const removeNode = async (item) => {
  if (!window.confirm(`${item.name}?`)) return
  unwrap(await requestDelete(`/api/wafpanel/nodes/${item.id}`))
  if (currentNode.value?.id === item.id) goNodes()
  await loadNodes(true)
}
const bootstrap = async () => {
  error.value = ''
  try {
    await loadNodes(true)
    const view = parseAdminViewQuery(route.query)
    if (view.wafNode) {
      const item = nodes.value.find((node) => node.id === view.wafNode)
      if (item) {
        currentNode.value = item
        page.value = view.wafPage || 'dashboard'
        await loadPageData()
      }
    }
  } catch (err) {
    error.value = err.message || String(err)
  }
}

watch(() => props.activeTab, (value) => {
  if (value === 'wafpanel') bootstrap()
}, { immediate: true })

onBeforeUnmount(() => {
  if (mapInstance) mapInstance.remove()
})
</script>
